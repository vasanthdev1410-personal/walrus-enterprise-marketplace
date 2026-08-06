import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { VerificationChallenge } from '../entities/verification-challenge';
import type { OtpEvidenceRecord } from '../entities/otp-evidence-record';
import type { VerificationAttempt } from '../entities/verification-attempt';

export interface VerificationChallengeRepository {
  findById(challengeId: UuidV7): Promise<VerificationChallenge | null>;
  insert(changeSet: VerificationAggregateChangeSet): Promise<void>;
  save(changeSet: VerificationAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
  completeTotpChallenge(command: CompleteTotpChallengePersistenceCommand): Promise<boolean>;
  rejectTotpChallenge(command: RejectTotpChallengePersistenceCommand): Promise<boolean>;
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

export interface VerificationAggregateChangeSet {
  readonly challenge: VerificationChallenge;
  readonly otpEvidence: readonly OtpEvidenceRecord[];
  readonly attemptsToAppend: readonly VerificationAttempt[];
}
