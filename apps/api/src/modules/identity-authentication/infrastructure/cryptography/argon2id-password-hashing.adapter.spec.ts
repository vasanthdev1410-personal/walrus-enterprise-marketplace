import { argon2id, hash } from 'argon2';
import { createIdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';
import { Argon2idPasswordHashingAdapter } from './argon2id-password-hashing.adapter';

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

describe('Argon2idPasswordHashingAdapter', () => {
  const adapter = new Argon2idPasswordHashingAdapter(configuration);

  it('hashes and verifies with the approved Argon2id profile', async () => {
    const encodedHash = await adapter.hash('correct horse battery staple');

    expect(encodedHash).toMatch(/^\$argon2id\$v=19\$m=65536,p=4,t=3\$/);
    await expect(adapter.verify('correct horse battery staple', encodedHash)).resolves.toBe(true);
    await expect(adapter.verify('incorrect password', encodedHash)).resolves.toBe(false);
    expect(adapter.needsRehash(encodedHash)).toBe(false);
  });

  it('uses a new random 128-bit salt for every hash', async () => {
    const first = await adapter.hash('same password');
    const second = await adapter.hash('same password');

    expect(first).not.toBe(second);
    await expect(adapter.verify('same password', first)).resolves.toBe(true);
    await expect(adapter.verify('same password', second)).resolves.toBe(true);
  });

  it('marks an older parameter profile for progressive rehash', async () => {
    const oldHash = await hash('password', {
      type: argon2id,
      memoryCost: 32_768,
      timeCost: 2,
      parallelism: 2,
      hashLength: 32,
    });

    expect(adapter.needsRehash(oldHash)).toBe(true);
    await expect(adapter.verify('password', oldHash)).resolves.toBe(true);
  });

  it('fails safely for malformed hashes and empty passwords', async () => {
    await expect(adapter.verify('password', 'not-a-password-hash')).resolves.toBe(false);
    expect(adapter.needsRehash('not-a-password-hash')).toBe(true);
    await expect(adapter.hash('')).rejects.toThrow('cannot be empty');
  });

  it('performs Argon2id work and fails generically when no candidate hash exists', async () => {
    await expect(
      adapter.verifyForAuthentication('unknown-identity-password', undefined),
    ).resolves.toBe(false);
  });
});
