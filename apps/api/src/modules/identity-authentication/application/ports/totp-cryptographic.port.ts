import type { EnvelopeEncryptionContext, ProtectedEnvelope } from './envelope-encryption.port';

export interface TotpEnrollmentSecret {
  readonly base32Secret: string;
  readonly protectedEnvelope: ProtectedEnvelope;
}

export interface TotpVerificationResult {
  readonly valid: boolean;
  readonly matchedTimeStep?: bigint;
}

export interface TotpCryptographicPort {
  createEnrollmentSecret(context: EnvelopeEncryptionContext): TotpEnrollmentSecret;
  verify(
    evidence: string,
    protectedEnvelope: ProtectedEnvelope,
    context: EnvelopeEncryptionContext,
    now: Date,
  ): TotpVerificationResult;
}
