import { createIdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';
import { loadJoseModule, NonProductionJwtAdapter } from './non-production-jwt.adapter';

const configuration = createIdentityAuthenticationConfiguration({
  JWT_ISSUER: 'https://identity.test.walrus.invalid',
  JWT_AUDIENCE: 'walrus-test',
  JWT_SIGNING_KEY_ID: 'test-key-1',
  JWT_SIGNING_KEY_REFERENCE: 'not-used-in-memory',
  JWT_VERIFICATION_KEY_SET_REFERENCE: 'not-used-in-memory',
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_VERSION: 'test-v1',
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-in-memory.key',
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

describe('NonProductionJwtAdapter', () => {
  it('signs and verifies only the approved authentication claims', async () => {
    const { generateKeyPair } = await loadJoseModule();
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const adapter = new NonProductionJwtAdapter(configuration, privateKey, publicKey);

    const token = await adapter.signAccessToken({
      subject: '01890f3e-7b5a-7cc0-8c9d-1234567890ab',
      sessionId: '01890f3e-7b5a-7cc0-8c9d-1234567890ac',
      jwtId: '01890f3e-7b5a-7cc0-8c9d-1234567890ad',
      authenticationMethods: ['PASSWORD', 'TOTP'],
      authenticationAssurance: 'AAL2',
      sessionVersion: 3,
      mfaState: 'VERIFIED',
    });
    const claims = await adapter.verifyAccessToken(token);

    expect(claims.subject).toBe('01890f3e-7b5a-7cc0-8c9d-1234567890ab');
    expect(claims.authenticationMethods).toEqual(['PASSWORD', 'TOTP']);
    expect(claims.authenticationAssurance).toBe('AAL2');
    expect(claims.sessionVersion).toBe(3);
  });

  it('publishes a public-only ES256 JWKS representation', async () => {
    const { generateKeyPair } = await loadJoseModule();
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const adapter = new NonProductionJwtAdapter(configuration, privateKey, publicKey);

    const jwks = await adapter.getPublicJsonWebKeySet();

    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({
      kty: 'EC',
      crv: 'P-256',
      use: 'sig',
      alg: 'ES256',
      kid: 'test-key-1',
    });
    expect(jwks.keys[0]).not.toHaveProperty('d');
  });

  it('rejects a validly signed token containing an authorization claim', async () => {
    const { generateKeyPair, SignJWT } = await loadJoseModule();
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const adapter = new NonProductionJwtAdapter(configuration, privateKey, publicKey);
    const issuedAt = Math.floor(Date.now() / 1_000);
    const token = await new SignJWT({
      sid: 'session-id',
      amr: ['PASSWORD'],
      acr: 'AAL1',
      sessionVersion: 1,
      role: 'ADMIN',
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key-1', typ: 'JWT' })
      .setSubject('identity-id')
      .setJti('jwt-id')
      .setIssuer(configuration.jwt.issuer)
      .setAudience(configuration.jwt.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 600)
      .sign(privateKey);

    await expect(adapter.verifyAccessToken(token)).rejects.toThrow('unapproved claim: role');
  });

  it('fails closed when the file adapter is requested in production', async () => {
    await expect(
      NonProductionJwtAdapter.fromPemFileReferences(configuration, 'production'),
    ).rejects.toThrow('prohibited in production');
  });
});
