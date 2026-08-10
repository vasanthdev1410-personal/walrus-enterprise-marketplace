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
  /**
   * Loads every approval-decision record of a recovery request for dual
   * control evaluation (M01-REC-005).
   */
  findApprovalRecords(
    recoveryRequestId: UuidV7,
  ): Promise<readonly RecoveryApprovalRecord[]>;
  insert(changeSet: RecoveryAggregateChangeSet): Promise<void>;
  save(changeSet: RecoveryAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
  /**
   * M01-REC-005. Atomically records one approver decision: appends the
   * approval record and state transitions with the recovery-request version
   * guard, all in one transaction. Throws OptimisticConcurrencyError without
   * mutating any state when the version is stale or the unique
   * (recoveryRequestId, approverIdentityId) constraint is violated, so a
   * stale caller or a concurrent duplicate decision rolls the change set back.
   */
  recordApprovalDecision(command: RecordApprovalDecisionPersistenceCommand): Promise<void>;
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
  /**
   * M01-REC-006. Atomically completes a recovery: transitions the request to
   * COMPLETED, appends the immutable EXECUTING and COMPLETED state transitions
   * and creates the completion notification, all in one transaction. The
   * version guard plus the executable-state guard make the transition
   * single-winner, so a concurrent execution can never apply completion twice;
   * a stale or already-completed request throws OptimisticConcurrencyError
   * without mutating any state.
   */
  executeRecovery(command: ExecuteRecoveryPersistenceCommand): Promise<void>;
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

export interface RecordApprovalDecisionPersistenceCommand {
  readonly recoveryRequestId: UuidV7;
  readonly expectedRecoveryVersion: AggregateVersion;
  readonly updatedRecoveryRequest: RecoveryRequest;
  readonly approvalRecord: RecoveryApprovalRecord;
  readonly transitionsToAppend: readonly RecoveryStateTransition[];
}

export interface ExecuteRecoveryPersistenceCommand {
  readonly recoveryRequestId: UuidV7;
  readonly expectedRecoveryVersion: AggregateVersion;
  /** The COMPLETED request carrying executionStartedAt, completedAt and the incremented versions. */
  readonly updatedRecoveryRequest: RecoveryRequest;
  readonly transitionsToAppend: readonly RecoveryStateTransition[];
  /** Optional RECOVERY_COMPLETED notification written with the transition. */
  readonly notification?: RecoveryNotificationRecord;
}

export interface RecoveryAggregateChangeSet {
  readonly recoveryRequest: RecoveryRequest;
  readonly evidence: readonly RecoveryEvidenceRecord[];
  readonly notifications: readonly RecoveryNotificationRecord[];
  readonly approvalsToAppend: readonly RecoveryApprovalRecord[];
  readonly attemptsToAppend: readonly RecoveryAttempt[];
  readonly transitionsToAppend: readonly RecoveryStateTransition[];
}
