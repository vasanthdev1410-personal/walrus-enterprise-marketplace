import type { VerificationPurpose } from '../../domain/verification/value-objects/verification-purpose';

export interface OtpDigestContext {
  readonly environment: string;
  readonly challengeId: string;
  readonly purpose: VerificationPurpose;
}

export interface RecoveryCodeDigestContext {
  readonly environment: string;
  readonly identityId: string;
  readonly recoveryCodeSetId: string;
}

export interface IssuedProtectedValue {
  readonly rawValue: string;
  readonly digest: string;
  readonly keyVersion: string;
}

export interface OtpRecoveryCodeCryptographicPort {
  issueOtp(context: OtpDigestContext): IssuedProtectedValue;
  matchesOtp(rawOtp: string, context: OtpDigestContext, storedDigest: string): boolean;
  issueRecoveryCodeSet(context: RecoveryCodeDigestContext): readonly IssuedProtectedValue[];
  matchesRecoveryCode(
    rawRecoveryCode: string,
    context: RecoveryCodeDigestContext,
    storedDigest: string,
  ): boolean;
}
