import { createIdentityAuthenticationConfiguration } from './identity-authentication.configuration';

const validEnvironment = {
  JWT_ISSUER: 'https://identity.local.walrus.invalid',
  JWT_AUDIENCE: 'walrus-local',
  JWT_SIGNING_KEY_ID: 'local-test-key-1',
  JWT_SIGNING_KEY_REFERENCE: 'local-reference/signing-key',
  JWT_VERIFICATION_KEY_SET_REFERENCE: 'local-reference/jwks',
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_VERSION: 'local-v2',
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/walrus-secrets/refresh-v2.key',
  REFRESH_TOKEN_HMAC_VERIFICATION_KEY_REFERENCES_JSON:
    '{"local-v1":"file:C:/walrus-secrets/refresh-v1.key"}',
  OTP_HMAC_ACTIVE_KEY_VERSION: 'local-otp-v1',
  OTP_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/walrus-secrets/otp-v1.hmac.key',
  OTP_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  RECOVERY_CODE_HMAC_ACTIVE_KEY_VERSION: 'local-recovery-v1',
  RECOVERY_CODE_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/walrus-secrets/recovery-v1.hmac.key',
  RECOVERY_CODE_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_VERSION: 'local-lookup-v1',
  IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/walrus-secrets/lookup-v1.key',
  IDENTIFIER_LOOKUP_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  M01_ENVELOPE_KEK_ACTIVE_VERSION: 'local-kek-v1',
  M01_ENVELOPE_KEK_ACTIVE_REFERENCE: 'file:C:/walrus-secrets/envelope-v1.key',
  M01_ENVELOPE_KEK_DECRYPTION_REFERENCES_JSON: '{}',
  CSRF_HMAC_ACTIVE_KEY_VERSION: 'local-csrf-v1',
  CSRF_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/walrus-secrets/csrf-v1.key',
  CSRF_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  EMAIL_VERIFICATION_PROVIDER: 'AWS_SES',
  SMS_VERIFICATION_PROVIDER: 'AWS_END_USER_MESSAGING_SMS',
} as const;

describe('Identity Authentication configuration', () => {
  it('materializes the approved security and session policies', () => {
    const configuration = createIdentityAuthenticationConfiguration(validEnvironment);

    expect(configuration.passwordHashing).toEqual({
      algorithm: 'ARGON2ID',
      memoryKibibytes: 65_536,
      iterations: 3,
      parallelism: 4,
      saltBytes: 16,
      outputBytes: 32,
    });
    expect(configuration.jwt.accessTokenLifetimeSeconds).toBe(600);
    expect(configuration.refreshToken.rotationRequired).toBe(true);
    expect(configuration.totp).toEqual({
      algorithm: 'HMAC_SHA256',
      secretBytes: 32,
      base32EncodedLength: 52,
      decimalLength: 6,
      timeStepSeconds: 30,
      allowedClockDriftSteps: 1,
      challengeLifetimeSeconds: 300,
      maximumVerificationAttempts: 5,
    });
    expect(configuration.refreshToken.verificationKeyReferences).toEqual({
      'local-v1': 'file:C:/walrus-secrets/refresh-v1.key',
    });
    expect(configuration.session).toEqual({
      standard: {
        idleTimeoutSeconds: 1_800,
        absoluteTimeoutSeconds: 86_400,
        maximumConcurrentSessions: 5,
      },
      privilegedAdmin: {
        idleTimeoutSeconds: 900,
        absoluteTimeoutSeconds: 28_800,
        maximumConcurrentSessions: 3,
      },
      superAdmin: {
        idleTimeoutSeconds: 600,
        absoluteTimeoutSeconds: 14_400,
        maximumConcurrentSessions: 2,
      },
    });
  });

  it('rejects missing environment-specific cryptographic references', () => {
    expect(() =>
      createIdentityAuthenticationConfiguration({
        ...validEnvironment,
        JWT_SIGNING_KEY_REFERENCE: undefined,
      }),
    ).toThrow();
  });

  it('does not accept an unapproved verification provider', () => {
    expect(() =>
      createIdentityAuthenticationConfiguration({
        ...validEnvironment,
        EMAIL_VERIFICATION_PROVIDER: 'UNAPPROVED_PROVIDER',
      }),
    ).toThrow();
  });
});
