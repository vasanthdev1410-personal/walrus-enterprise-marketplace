import type {
  OtpEvidenceRecord as OtpEvidencePersistenceRecord,
  Prisma,
  VerificationAttempt as VerificationAttemptRecord,
  VerificationChallenge as VerificationChallengeRecord,
} from '../../../../../../generated/prisma/client';
import { OtpEvidenceRecord } from '../../../../domain/verification/entities/otp-evidence-record';
import { VerificationAttempt } from '../../../../domain/verification/entities/verification-attempt';
import { VerificationChallenge } from '../../../../domain/verification/entities/verification-challenge';
import { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../domain/shared/value-objects/correlation-identifier';
import { ProtectedValue } from '../../../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import { compactProperties } from './compact-properties';

export const verificationChallengeMapper = {
  toDomain(record: VerificationChallengeRecord): VerificationChallenge {
    return new VerificationChallenge(
      compactProperties({
        challengeId: new UuidV7(record.challengeId),
        identityId: record.identityId === null ? undefined : new UuidV7(record.identityId),
        purpose: record.purpose,
        channelType: record.channelType,
        protectedDestinationReference: new ProtectedValue(record.protectedDestinationReference),
        challengeDigest: new ProtectedValue(record.challengeDigest),
        challengeState: record.challengeState,
        attemptCount: record.attemptCount,
        maximumAttempts: record.maximumAttempts,
        expiresAt: record.expiresAt,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        consumedAt: record.consumedAt ?? undefined,
        cancelledAt: record.cancelledAt ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(entity: VerificationChallenge): Prisma.VerificationChallengeUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      challengeId: value.challengeId.value,
      identityId: value.identityId?.value,
      purpose: value.purpose,
      channelType: value.channelType,
      protectedDestinationReference: value.protectedDestinationReference.value,
      challengeDigest: value.challengeDigest.value,
      challengeState: value.challengeState,
      attemptCount: value.attemptCount,
      maximumAttempts: value.maximumAttempts,
      expiresAt: value.expiresAt,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      consumedAt: value.consumedAt,
      cancelledAt: value.cancelledAt,
      correlationId: value.correlationId?.value,
    });
  },
};

export const verificationAttemptMapper = {
  toDomain(record: VerificationAttemptRecord): VerificationAttempt {
    return new VerificationAttempt(
      compactProperties({
        verificationAttemptId: new UuidV7(record.verificationAttemptId),
        challengeId: new UuidV7(record.challengeId),
        outcome: record.outcome,
        attemptedAt: record.attemptedAt,
        createdAt: record.createdAt,
        sourceIpReference:
          record.sourceIpReference === null
            ? undefined
            : new ProtectedValue(record.sourceIpReference),
        deviceReference:
          record.deviceReference === null ? undefined : new ProtectedValue(record.deviceReference),
        failureReason: record.failureReason ?? undefined,
      }),
    );
  },
  toPersistence(entity: VerificationAttempt): Prisma.VerificationAttemptUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      verificationAttemptId: value.verificationAttemptId.value,
      challengeId: value.challengeId.value,
      outcome: value.outcome,
      attemptedAt: value.attemptedAt,
      createdAt: value.createdAt,
      sourceIpReference: value.sourceIpReference?.value,
      deviceReference: value.deviceReference?.value,
      failureReason: value.failureReason,
    });
  },
};

export const otpEvidenceMapper = {
  toDomain(record: OtpEvidencePersistenceRecord): OtpEvidenceRecord {
    return new OtpEvidenceRecord(
      compactProperties({
        otpEvidenceId: new UuidV7(record.otpEvidenceId),
        challengeId: new UuidV7(record.challengeId),
        evidenceDigest: new ProtectedValue(record.evidenceDigest),
        evidenceState: record.evidenceState,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        consumedAt: record.consumedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: OtpEvidenceRecord): Prisma.OtpEvidenceRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      otpEvidenceId: value.otpEvidenceId.value,
      challengeId: value.challengeId.value,
      evidenceDigest: value.evidenceDigest.value,
      evidenceState: value.evidenceState,
      expiresAt: value.expiresAt,
      createdAt: value.createdAt,
      consumedAt: value.consumedAt,
    });
  },
};
