import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';
import { NonProductionRefreshTokenAdapter } from './non-production-refresh-token.adapter';

describe('NonProductionRefreshTokenAdapter', () => {
  it('issues a 256-bit token and verifies its versioned HMAC digest', () => {
    const adapter = new NonProductionRefreshTokenAdapter(
      { version: 'local-v2', key: randomBytes(32) },
      [],
    );

    const issued = adapter.issue();

    expect(issued.rawToken).toMatch(/^wr1\.local-v2\.[A-Za-z0-9_-]{43}$/);
    expect(issued.digest).toMatch(/^hmac-sha256:local-v2:[A-Za-z0-9_-]{43}$/);
    expect(adapter.matches(issued.rawToken, issued.digest)).toBe(true);
    expect(adapter.matches(`${issued.rawToken}x`, issued.digest)).toBe(false);
  });

  it('retains previous keys for verification but issues only with the active key', () => {
    const previousKey = randomBytes(32);
    const previousAdapter = new NonProductionRefreshTokenAdapter(
      { version: 'local-v1', key: previousKey },
      [],
    );
    const previousToken = previousAdapter.issue();
    const rotatedAdapter = new NonProductionRefreshTokenAdapter(
      { version: 'local-v2', key: randomBytes(32) },
      [{ version: 'local-v1', key: previousKey }],
    );

    expect(rotatedAdapter.matches(previousToken.rawToken, previousToken.digest)).toBe(true);
    expect(rotatedAdapter.issue().keyVersion).toBe('local-v2');
  });

  it('loads a 32-byte base64url key from an absolute file reference', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'walrus-refresh-token-'));
    const keyPath = join(directory, 'refresh-token.hmac.key');
    await writeFile(keyPath, randomBytes(32).toString('base64url'), 'utf8');
    const configuration = createIdentityAuthenticationConfiguration({
      JWT_ISSUER: 'https://identity.test.walrus.invalid',
      JWT_AUDIENCE: 'walrus-test',
      JWT_SIGNING_KEY_ID: 'test-key-1',
      JWT_SIGNING_KEY_REFERENCE: 'file:C:/not-used.key',
      JWT_VERIFICATION_KEY_SET_REFERENCE: 'file:C:/not-used.pub',
      REFRESH_TOKEN_HMAC_ACTIVE_KEY_VERSION: 'test-v1',
      REFRESH_TOKEN_HMAC_ACTIVE_KEY_REFERENCE: `file:${keyPath}`,
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

    try {
      const adapter = await NonProductionRefreshTokenAdapter.fromFileReferences(
        configuration,
        'test',
      );
      const issued = adapter.issue();
      expect(adapter.matches(issued.rawToken, issued.digest)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails closed before reading keys in production', async () => {
    const configuration = createIdentityAuthenticationConfiguration({
      JWT_ISSUER: 'https://identity.test.walrus.invalid',
      JWT_AUDIENCE: 'walrus-test',
      JWT_SIGNING_KEY_ID: 'test-key-1',
      JWT_SIGNING_KEY_REFERENCE: 'file:C:/not-used.key',
      JWT_VERIFICATION_KEY_SET_REFERENCE: 'file:C:/not-used.pub',
      REFRESH_TOKEN_HMAC_ACTIVE_KEY_VERSION: 'test-v1',
      REFRESH_TOKEN_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used.hmac.key',
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

    await expect(
      NonProductionRefreshTokenAdapter.fromFileReferences(configuration, 'production'),
    ).rejects.toThrow('prohibited in production');
  });

  it('rejects duplicate key versions and malformed keys', () => {
    expect(
      () =>
        new NonProductionRefreshTokenAdapter({ version: 'v1', key: randomBytes(32) }, [
          { version: 'dup', key: randomBytes(32) },
          { version: 'dup', key: randomBytes(32) },
        ]),
    ).toThrow('key versions must be unique');
    expect(
      () =>
        new NonProductionRefreshTokenAdapter({ version: 'bad version', key: randomBytes(32) }, []),
    ).toThrow('HMAC key is invalid');
    expect(
      () => new NonProductionRefreshTokenAdapter({ version: 'ok', key: randomBytes(16) }, []),
    ).toThrow('HMAC key is invalid');
  });

  it('rejects an unknown key version when computing a digest', () => {
    const adapter = new NonProductionRefreshTokenAdapter(
      { version: 'v1', key: randomBytes(32) },
      [],
    );
    const forged = `wr1.unknown.${randomBytes(32).toString('base64url')}`;
    expect(() => adapter.computeDigest(forged)).toThrow('key version is not available');
    expect(adapter.matches(forged, 'hmac-sha256:unknown:abc')).toBe(false);
  });

  it('rejects invalid file references and malformed key files', async () => {
    const base = createIdentityAuthenticationConfiguration({
      JWT_ISSUER: 'https://identity.test.walrus.invalid',
      JWT_AUDIENCE: 'walrus-test',
      JWT_SIGNING_KEY_ID: 'test-key-1',
      JWT_SIGNING_KEY_REFERENCE: 'file:C:/not-used.key',
      JWT_VERIFICATION_KEY_SET_REFERENCE: 'file:C:/not-used.pub',
      REFRESH_TOKEN_HMAC_ACTIVE_KEY_VERSION: 'test-v1',
      REFRESH_TOKEN_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used.hmac.key',
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

    await expect(
      NonProductionRefreshTokenAdapter.fromFileReferences(
        { ...base, refreshToken: { ...base.refreshToken, activeKeyReference: 'not-a-file' } },
        'test',
      ),
    ).rejects.toThrow('must use the file: scheme');

    await expect(
      NonProductionRefreshTokenAdapter.fromFileReferences(
        {
          ...base,
          refreshToken: { ...base.refreshToken, activeKeyReference: 'file:relative.key' },
        },
        'test',
      ),
    ).rejects.toThrow('must be absolute');

    const directory = await mkdtemp(join(tmpdir(), 'walrus-refresh-token-bad-'));
    try {
      const paddedPath = join(directory, 'padded.key');
      await writeFile(paddedPath, 'abc=', 'utf8');
      await expect(
        NonProductionRefreshTokenAdapter.fromFileReferences(
          {
            ...base,
            refreshToken: { ...base.refreshToken, activeKeyReference: `file:${paddedPath}` },
          },
          'test',
        ),
      ).rejects.toThrow('must be unpadded base64url');

      const shortPath = join(directory, 'short.key');
      await writeFile(shortPath, randomBytes(16).toString('base64url'), 'utf8');
      await expect(
        NonProductionRefreshTokenAdapter.fromFileReferences(
          {
            ...base,
            refreshToken: { ...base.refreshToken, activeKeyReference: `file:${shortPath}` },
          },
          'test',
        ),
      ).rejects.toThrow('exactly 256 random bits');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
