import { z } from 'zod';

const nonEmptyReference = z.string().trim().min(1);
const keyReferenceMap = z
  .string()
  .default('{}')
  .transform((value, context): Readonly<Record<string, string>> => {
    try {
      return z.record(nonEmptyReference.max(64), nonEmptyReference).parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid verification key reference map' });
      return z.NEVER;
    }
  });

export const identityAuthenticationEnvironmentSchema = z.object({
  JWT_ISSUER: z.url(),
  JWT_AUDIENCE: nonEmptyReference,
  JWT_SIGNING_KEY_ID: nonEmptyReference,
  JWT_SIGNING_KEY_REFERENCE: nonEmptyReference,
  JWT_VERIFICATION_KEY_SET_REFERENCE: nonEmptyReference,
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_VERSION: nonEmptyReference.max(64),
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_REFERENCE: nonEmptyReference,
  REFRESH_TOKEN_HMAC_VERIFICATION_KEY_REFERENCES_JSON: keyReferenceMap,
  OTP_HMAC_ACTIVE_KEY_VERSION: nonEmptyReference.max(64),
  OTP_HMAC_ACTIVE_KEY_REFERENCE: nonEmptyReference,
  OTP_HMAC_VERIFICATION_KEY_REFERENCES_JSON: keyReferenceMap,
  RECOVERY_CODE_HMAC_ACTIVE_KEY_VERSION: nonEmptyReference.max(64),
  RECOVERY_CODE_HMAC_ACTIVE_KEY_REFERENCE: nonEmptyReference,
  RECOVERY_CODE_HMAC_VERIFICATION_KEY_REFERENCES_JSON: keyReferenceMap,
  IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_VERSION: nonEmptyReference.max(64),
  IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_REFERENCE: nonEmptyReference,
  IDENTIFIER_LOOKUP_HMAC_VERIFICATION_KEY_REFERENCES_JSON: keyReferenceMap,
  M01_ENVELOPE_KEK_ACTIVE_VERSION: nonEmptyReference.max(64),
  M01_ENVELOPE_KEK_ACTIVE_REFERENCE: nonEmptyReference,
  M01_ENVELOPE_KEK_DECRYPTION_REFERENCES_JSON: keyReferenceMap,
  CSRF_HMAC_ACTIVE_KEY_VERSION: nonEmptyReference.max(64),
  CSRF_HMAC_ACTIVE_KEY_REFERENCE: nonEmptyReference,
  CSRF_HMAC_VERIFICATION_KEY_REFERENCES_JSON: keyReferenceMap,
  EMAIL_VERIFICATION_PROVIDER: z.literal('AWS_SES'),
  SMS_VERIFICATION_PROVIDER: z.literal('AWS_END_USER_MESSAGING_SMS'),
});

export type IdentityAuthenticationEnvironment = z.infer<
  typeof identityAuthenticationEnvironmentSchema
>;

export interface IdentityAuthenticationConfiguration {
  readonly csrf: {
    readonly activeKeyVersion: string;
    readonly activeKeyReference: string;
    readonly verificationKeyReferences: Readonly<Record<string, string>>;
  };
  readonly envelopeEncryption: {
    readonly activeKekVersion: string;
    readonly activeKekReference: string;
    readonly decryptionKekReferences: Readonly<Record<string, string>>;
  };
  readonly identifierLookup: {
    readonly activeKeyVersion: string;
    readonly activeKeyReference: string;
    readonly verificationKeyReferences: Readonly<Record<string, string>>;
  };
  readonly jwt: {
    readonly algorithm: 'ES256';
    readonly issuer: string;
    readonly audience: string;
    readonly signingKeyId: string;
    readonly signingKeyReference: string;
    readonly verificationKeySetReference: string;
    readonly accessTokenLifetimeSeconds: 600;
    readonly clockSkewSeconds: 60;
    readonly signingKeyRotationSeconds: 7_776_000;
    readonly verificationKeyOverlapSeconds: 1_800;
  };
  readonly passwordHashing: {
    readonly algorithm: 'ARGON2ID';
    readonly memoryKibibytes: 65_536;
    readonly iterations: 3;
    readonly parallelism: 4;
    readonly saltBytes: 16;
    readonly outputBytes: 32;
  };
  /** Password policy (M01-CRED-001): length bounds and reuse-history depth. */
  readonly credentialPolicy: {
    readonly minimumPasswordLength: 8;
    readonly maximumPasswordLength: 1024;
    readonly passwordHistoryDepth: 5;
  };
  readonly refreshToken: {
    readonly standardLifetimeSeconds: 2_592_000;
    readonly privilegedLifetimeSeconds: 28_800;
    readonly entropyBytes: 32;
    readonly digestAlgorithm: 'HMAC_SHA256';
    readonly activeKeyVersion: string;
    readonly activeKeyReference: string;
    readonly verificationKeyReferences: Readonly<Record<string, string>>;
    readonly rotationRequired: true;
  };
  readonly otp: {
    readonly decimalLength: 6;
    readonly lifetimeSeconds: 300;
    readonly maximumVerificationAttempts: 5;
    readonly resendIntervalSeconds: 60;
    readonly maximumSendsPerFifteenMinutes: 3;
    readonly maximumSendsPerDay: 10;
    readonly activeKeyVersion: string;
    readonly activeKeyReference: string;
    readonly verificationKeyReferences: Readonly<Record<string, string>>;
  };
  readonly totp: {
    readonly algorithm: 'HMAC_SHA256';
    readonly secretBytes: 32;
    readonly base32EncodedLength: 52;
    readonly decimalLength: 6;
    readonly timeStepSeconds: 30;
    readonly allowedClockDriftSteps: 1;
    readonly challengeLifetimeSeconds: 300;
    readonly maximumVerificationAttempts: 5;
  };
  readonly recoveryCode: {
    readonly count: 10;
    readonly entropyBytesPerCode: 16;
    readonly base32EncodedLength: 26;
    readonly activeKeyVersion: string;
    readonly activeKeyReference: string;
    readonly verificationKeyReferences: Readonly<Record<string, string>>;
  };
  readonly session: {
    readonly standard: SessionPolicy;
    readonly privilegedAdmin: SessionPolicy;
    readonly superAdmin: SessionPolicy;
  };
  readonly providers: {
    readonly emailVerification: 'AWS_SES';
    readonly smsVerification: 'AWS_END_USER_MESSAGING_SMS';
  };
}

export interface SessionPolicy {
  readonly idleTimeoutSeconds: number;
  readonly absoluteTimeoutSeconds: number;
  readonly maximumConcurrentSessions: number;
}

export function createIdentityAuthenticationConfiguration(
  input: Readonly<Record<string, string | undefined>>,
): IdentityAuthenticationConfiguration {
  const environment = identityAuthenticationEnvironmentSchema.parse(input);

  return Object.freeze({
    csrf: Object.freeze({
      activeKeyVersion: environment.CSRF_HMAC_ACTIVE_KEY_VERSION,
      activeKeyReference: environment.CSRF_HMAC_ACTIVE_KEY_REFERENCE,
      verificationKeyReferences: Object.freeze({
        ...environment.CSRF_HMAC_VERIFICATION_KEY_REFERENCES_JSON,
      }),
    }),
    envelopeEncryption: Object.freeze({
      activeKekVersion: environment.M01_ENVELOPE_KEK_ACTIVE_VERSION,
      activeKekReference: environment.M01_ENVELOPE_KEK_ACTIVE_REFERENCE,
      decryptionKekReferences: Object.freeze({
        ...environment.M01_ENVELOPE_KEK_DECRYPTION_REFERENCES_JSON,
      }),
    }),
    identifierLookup: Object.freeze({
      activeKeyVersion: environment.IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_VERSION,
      activeKeyReference: environment.IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_REFERENCE,
      verificationKeyReferences: Object.freeze({
        ...environment.IDENTIFIER_LOOKUP_HMAC_VERIFICATION_KEY_REFERENCES_JSON,
      }),
    }),
    jwt: Object.freeze({
      algorithm: 'ES256',
      issuer: environment.JWT_ISSUER,
      audience: environment.JWT_AUDIENCE,
      signingKeyId: environment.JWT_SIGNING_KEY_ID,
      signingKeyReference: environment.JWT_SIGNING_KEY_REFERENCE,
      verificationKeySetReference: environment.JWT_VERIFICATION_KEY_SET_REFERENCE,
      accessTokenLifetimeSeconds: 600,
      clockSkewSeconds: 60,
      signingKeyRotationSeconds: 7_776_000,
      verificationKeyOverlapSeconds: 1_800,
    }),
    passwordHashing: Object.freeze({
      algorithm: 'ARGON2ID',
      memoryKibibytes: 65_536,
      iterations: 3,
      parallelism: 4,
      saltBytes: 16,
      outputBytes: 32,
    }),
    credentialPolicy: Object.freeze({
      minimumPasswordLength: 8,
      maximumPasswordLength: 1024,
      passwordHistoryDepth: 5,
    }),
    refreshToken: Object.freeze({
      standardLifetimeSeconds: 2_592_000,
      privilegedLifetimeSeconds: 28_800,
      entropyBytes: 32,
      digestAlgorithm: 'HMAC_SHA256',
      activeKeyVersion: environment.REFRESH_TOKEN_HMAC_ACTIVE_KEY_VERSION,
      activeKeyReference: environment.REFRESH_TOKEN_HMAC_ACTIVE_KEY_REFERENCE,
      verificationKeyReferences: Object.freeze({
        ...environment.REFRESH_TOKEN_HMAC_VERIFICATION_KEY_REFERENCES_JSON,
      }),
      rotationRequired: true,
    }),
    otp: Object.freeze({
      decimalLength: 6,
      lifetimeSeconds: 300,
      maximumVerificationAttempts: 5,
      resendIntervalSeconds: 60,
      maximumSendsPerFifteenMinutes: 3,
      maximumSendsPerDay: 10,
      activeKeyVersion: environment.OTP_HMAC_ACTIVE_KEY_VERSION,
      activeKeyReference: environment.OTP_HMAC_ACTIVE_KEY_REFERENCE,
      verificationKeyReferences: Object.freeze({
        ...environment.OTP_HMAC_VERIFICATION_KEY_REFERENCES_JSON,
      }),
    }),
    totp: Object.freeze({
      algorithm: 'HMAC_SHA256',
      secretBytes: 32,
      base32EncodedLength: 52,
      decimalLength: 6,
      timeStepSeconds: 30,
      allowedClockDriftSteps: 1,
      challengeLifetimeSeconds: 300,
      maximumVerificationAttempts: 5,
    }),
    recoveryCode: Object.freeze({
      count: 10,
      entropyBytesPerCode: 16,
      base32EncodedLength: 26,
      activeKeyVersion: environment.RECOVERY_CODE_HMAC_ACTIVE_KEY_VERSION,
      activeKeyReference: environment.RECOVERY_CODE_HMAC_ACTIVE_KEY_REFERENCE,
      verificationKeyReferences: Object.freeze({
        ...environment.RECOVERY_CODE_HMAC_VERIFICATION_KEY_REFERENCES_JSON,
      }),
    }),
    session: Object.freeze({
      standard: Object.freeze({
        idleTimeoutSeconds: 1_800,
        absoluteTimeoutSeconds: 86_400,
        maximumConcurrentSessions: 5,
      }),
      privilegedAdmin: Object.freeze({
        idleTimeoutSeconds: 900,
        absoluteTimeoutSeconds: 28_800,
        maximumConcurrentSessions: 3,
      }),
      superAdmin: Object.freeze({
        idleTimeoutSeconds: 600,
        absoluteTimeoutSeconds: 14_400,
        maximumConcurrentSessions: 2,
      }),
    }),
    providers: Object.freeze({
      emailVerification: environment.EMAIL_VERIFICATION_PROVIDER,
      smsVerification: environment.SMS_VERIFICATION_PROVIDER,
    }),
  });
}
