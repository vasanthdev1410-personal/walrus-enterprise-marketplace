import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { VerificationChallenge } from '../entities/verification-challenge';
import type { OtpEvidenceRecord } from '../entities/otp-evidence-record';
import type { VerificationAttempt } from '../entities/verification-attempt';
import type { VerificationChannel } from '../value-objects/verification-channel';
import type { VerificationPurpose } from '../value-objects/verification-purpose';

export interface VerificationChallengeRepository {
  findById(challengeId: UuidV7): Promise<VerificationChallenge | null>;
  /** Loads a challenge together with its OTP evidence records for verification. */
  findAggregateById(challengeId: UuidV7): Promise<VerificationChallengeAggregate | null>;
  /**
   * Finds the single active (issued, unexpired) challenge bound to an identity,
   * purpose and channel so a second challenge is never issued while one is live.
   */
  findActiveByBinding(
    identityId: UuidV7,
    purpose: VerificationPurpose,
    channelType: VerificationChannel,
  ): Promise<VerificationChallenge | null>;
  insert(changeSet: VerificationAggregateChangeSet): Promise<void>;
  save(changeSet: VerificationAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
  completeTotpChallenge(command: CompleteTotpChallengePersistenceCommand): Promise<boolean>;
  rejectTotpChallenge(command: RejectTotpChallengePersistenceCommand): Promise<boolean>;
  /**
   * Atomically marks an issued OTP challenge VERIFIED and its active evidence
   * CONSUMED while appending the success attempt. Guards against replay,
   * concurrency (version) and expiry.
   */
  confirmOtpChallenge(command: ConfirmOtpChallengePersistenceCommand): Promise<boolean>;
  /**
   * Atomically records a rejected OTP attempt, advancing the challenge to FAILED
   * when terminal or leaving it issued otherwise.
   */
  rejectOtpChallenge(command: RejectOtpChallengePersistenceCommand): Promise<boolean>;
}

export interface VerificationChallengeAggregate {
  readonly challenge: VerificationChallenge;
  readonly otpEvidence: readonly OtpEvidenceRecord[];
}

export interface CompleteTotpChallengePersistenceCommand {
  readonly challengeId: UuidV7;
  readonly factorId: UuidV7;
  readonly candidateTimeStep: bigint;
  readonly attempt: VerificationAttempt;
  readonly expectedVersion: AggregateVersion;
  readonly completedAt: Date;
}

export interface RejectTotpChallengePersistenceCommand {
  readonly challengeId: UuidV7;
  readonly attempt: VerificationAttempt;
  readonly expectedVersion: AggregateVersion;
  readonly rejectedAt: Date;
  readonly terminal: boolean;
}

export interface ConfirmOtpChallengePersistenceCommand {
  readonly challengeId: UuidV7;
  readonly attempt: VerificationAttempt;
  readonly expectedVersion: AggregateVersion;
  readonly completedAt: Date;
  readonly updatedChallenge: VerificationChallenge;
  readonly consumedEvidence: OtpEvidenceRecord | null;
}

export interface RejectOtpChallengePersistenceCommand {
  readonly challengeId: UuidV7;
  readonly attempt: VerificationAttempt;
  readonly expectedVersion: AggregateVersion;
  readonly rejectedAt: Date;
  readonly updatedChallenge: VerificationChallenge;
}

export interface VerificationAggregateChangeSet {
  readonly challenge: VerificationChallenge;
  readonly otpEvidence: readonly OtpEvidenceRecord[];
  readonly attemptsToAppend: readonly VerificationAttempt[];
}
