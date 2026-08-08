import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';
import { NonProductionIdentifierLookupAdapter } from './non-production-identifier-lookup.adapter';

const context = {
  environment: 'test',
  identifierType: 'EMAIL',
  canonicalValue: 'identity@example.com',
} as const;

const configuration = createIdentityAuthenticationConfiguration({
  JWT_ISSUER: 'https://identity.test.walrus.invalid',
  JWT_AUDIENCE: 'walrus-test',
  JWT_SIGNING_KEY_ID: 'test-key-1',
  JWT_SIGNING_KEY_REFERENCE: 'file:C:/not-used.key',
  JWT_VERIFICATION_KEY_SET_REFERENCE: 'file:C:/not-used.pub',
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_VERSION: 'test-refresh-v1',
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-refresh.key',
  REFRESH_TOKEN_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  OTP_HMAC_ACTIVE_KEY_VERSION: 'test-otp-v1',
  OTP_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-otp.key',
  OTP_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  RECOVERY_CODE_HMAC_ACTIVE_KEY_VERSION: 'test-recovery-v1',
  RECOVERY_CODE_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-recovery.key',
  RECOVERY_CODE_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_VERSION: 'test-lookup-v1',
  IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-lookup.key',
  IDENTIFIER_LOOKUP_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  M01_ENVELOPE_KEK_ACTIVE_VERSION: 'test-kek-v1',
  M01_ENVELOPE_KEK_ACTIVE_REFERENCE: 'file:C:/not-used-envelope.key',
  M01_ENVELOPE_KEK_DECRYPTION_REFERENCES_JSON: '{}',
  CSRF_HMAC_ACTIVE_KEY_VERSION: 'test-csrf-v1',
  CSRF_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-csrf.key',
  CSRF_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  EMAIL_VERIFICATION_PROVIDER: 'AWS_SES',
  SMS_VERIFICATION_PROVIDER: 'AWS_END_USER_MESSAGING_SMS',
});

describe('NonProductionIdentifierLookupAdapter', () => {
  it('creates a deterministic protected lookup without exposing the identifier', () => {
    const adapter = new NonProductionIdentifierLookupAdapter(
      { version: 'test-lookup-v1', key: randomBytes(32) },
      [],
    );

    const first = adapter.createActiveLookup(context);
    const second = adapter.createActiveLookup(context);

    expect(first).toBe(second);
    expect(first).toMatch(/^hmac-sha256:identifier-lookup:v1:test-lookup-v1:[A-Za-z0-9_-]{43}$/);
    expect(first).not.toContain(context.canonicalValue);
  });

  it('separates identifier type and environment', () => {
    const adapter = new NonProductionIdentifierLookupAdapter(
      { version: 'test-lookup-v1', key: randomBytes(32) },
      [],
    );

    expect(adapter.createActiveLookup(context)).not.toBe(
      adapter.createActiveLookup({ ...context, identifierType: 'MOBILE' }),
    );
    expect(adapter.createActiveLookup(context)).not.toBe(
      adapter.createActiveLookup({ ...context, environment: 'staging' }),
    );
  });

  it('produces active and previous lookup candidates during rotation', () => {
    const adapter = new NonProductionIdentifierLookupAdapter(
      { version: 'test-lookup-v2', key: randomBytes(32) },
      [{ version: 'test-lookup-v1', key: randomBytes(32) }],
    );

    const candidates = adapter.createLookupsForResolution(context);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toContain(':test-lookup-v2:');
    expect(candidates[1]).toContain(':test-lookup-v1:');
  });

  it('fails closed before reading a key reference in production', async () => {
    await expect(
      NonProductionIdentifierLookupAdapter.fromFileReferences(configuration, 'production'),
    ).rejects.toThrow('prohibited in production');
  });

  it('rejects duplicate key versions during rotation', () => {
    expect(
      () =>
        new NonProductionIdentifierLookupAdapter({ version: 'v1', key: randomBytes(32) }, [
          { version: 'dup', key: randomBytes(32) },
          { version: 'dup', key: randomBytes(32) },
        ]),
    ).toThrow('key versions must be unique');
  });

  it('rejects malformed keys and invalid lookup contexts', () => {
    expect(
      () =>
        new NonProductionIdentifierLookupAdapter(
          { version: 'bad version', key: randomBytes(32) },
          [],
        ),
    ).toThrow('HMAC key is invalid');
    expect(
      () => new NonProductionIdentifierLookupAdapter({ version: 'ok', key: randomBytes(16) }, []),
    ).toThrow('HMAC key is invalid');

    const adapter = new NonProductionIdentifierLookupAdapter(
      { version: 'ok', key: randomBytes(32) },
      [],
    );
    expect(() =>
      adapter.createActiveLookup({
        environment: 'bad env!',
        identifierType: 'EMAIL',
        canonicalValue: 'a@b.co',
      }),
    ).toThrow('Identifier Lookup context is invalid');
    expect(() =>
      adapter.createActiveLookup({
        environment: 'test',
        identifierType: 'EMAIL',
        canonicalValue: '',
      }),
    ).toThrow('Identifier Lookup context is invalid');
    expect(() =>
      adapter.createActiveLookup({
        environment: 'test',
        identifierType: 'EMAIL',
        canonicalValue: 'a|b',
      }),
    ).toThrow('Identifier Lookup context is invalid');
  });

  it('usesSameKeyMaterial matches only exact key material of the correct length', () => {
    const key = randomBytes(32);
    const adapter = new NonProductionIdentifierLookupAdapter({ version: 'v1', key }, []);
    expect(adapter.usesSameKeyMaterial(key)).toBe(true);
    expect(adapter.usesSameKeyMaterial(randomBytes(32))).toBe(false);
    expect(adapter.usesSameKeyMaterial(randomBytes(16))).toBe(false);
  });

  it('rejects invalid file references and malformed key files', async () => {
    await expect(
      NonProductionIdentifierLookupAdapter.fromFileReferences(
        {
          ...configuration,
          identifierLookup: {
            ...configuration.identifierLookup,
            activeKeyReference: 'not-a-file-reference',
          },
        },
        'test',
      ),
    ).rejects.toThrow('must use file:');

    await expect(
      NonProductionIdentifierLookupAdapter.fromFileReferences(
        {
          ...configuration,
          identifierLookup: {
            ...configuration.identifierLookup,
            activeKeyReference: 'file:relative/path.key',
          },
        },
        'test',
      ),
    ).rejects.toThrow('must be absolute');

    const directory = await mkdtemp(join(tmpdir(), 'walrus-lookup-'));
    try {
      const paddedPath = join(directory, 'padded.key');
      await writeFile(paddedPath, 'abc=', 'utf8');
      await expect(
        NonProductionIdentifierLookupAdapter.fromFileReferences(
          {
            ...configuration,
            identifierLookup: {
              ...configuration.identifierLookup,
              activeKeyReference: `file:${paddedPath}`,
            },
          },
          'test',
        ),
      ).rejects.toThrow('must be unpadded base64url');

      const shortPath = join(directory, 'short.key');
      await writeFile(shortPath, randomBytes(16).toString('base64url'), 'utf8');
      await expect(
        NonProductionIdentifierLookupAdapter.fromFileReferences(
          {
            ...configuration,
            identifierLookup: {
              ...configuration.identifierLookup,
              activeKeyReference: `file:${shortPath}`,
            },
          },
          'test',
        ),
      ).rejects.toThrow('exactly 256 random bits');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
