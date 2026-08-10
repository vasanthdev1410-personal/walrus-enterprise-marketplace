import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { RecoveryRequest } from '../entities/recovery-request';
import type { RecoveryApprovalRecord } from '../entities/recovery-approval-record';
import type { RecoveryAttempt } from '../entities/recovery-attempt';
import type { RecoveryEvidenceRecord } from '../entities/recovery-evidence-record';
import type { RecoveryNotificationRecord } from '../entities/recovery-notification-record';
import type { RecoveryStateTransition } from '../entities/recovery-state-transition';

export interface RecoveryRequestRepository {
  findById(recoveryRequestId: UuidV7): Promise<RecoveryRequest | null>;
  /** Loads every evidence record of a recovery request for policy evaluation. */
  findEvidence(recoveryRequestId: UuidV7): Promise<readonly RecoveryEvidenceRecord[]>;
  insert(changeSet: RecoveryAggregateChangeSet): Promise<void>;
  save(changeSet: RecoveryAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
  /**
   * M01-REC-002. Atomically verifies recovery-code evidence: consumes the
   * matching single-use recovery code and commits the verified evidence,
   * success attempt and state transition with the recovery-request version
   * guard, all in one transaction. Throws OptimisticConcurrencyError without
   * mutating any state when the code was already consumed or the request
   * version is stale, so a failed guard rolls the whole change set back.
   */
  submitRecoveryCodeEvidence(
    command: SubmitRecoveryCodeEvidencePersistenceCommand,
  ): Promise<void>;
}

export interface SubmitRecoveryCodeEvidencePersistenceCommand {
  readonly recoveryRequestId: UuidV7;
  readonly expectedRecoveryVersion: AggregateVersion;
  readonly updatedRecoveryRequest: RecoveryRequest;
  readonly evidence: RecoveryEvidenceRecord;
  readonly attempt: RecoveryAttempt;
  readonly transitionsToAppend: readonly RecoveryStateTransition[];
  readonly consumedRecoveryCodeId: UuidV7;
}

export interface RecoveryAggregateChangeSet {
  readonly recoveryRequest: RecoveryRequest;
  readonly evidence: readonly RecoveryEvidenceRecord[];
  readonly notifications: readonly RecoveryNotificationRecord[];
  readonly approvalsToAppend: readonly RecoveryApprovalRecord[];
  readonly attemptsToAppend: readonly RecoveryAttempt[];
  readonly transitionsToAppend: readonly RecoveryStateTransition[];
}
