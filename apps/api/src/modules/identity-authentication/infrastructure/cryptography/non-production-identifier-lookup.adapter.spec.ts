import { randomBytes } from 'node:crypto';
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
});
