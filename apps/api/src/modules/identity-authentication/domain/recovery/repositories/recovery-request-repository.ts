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
  insert(changeSet: RecoveryAggregateChangeSet): Promise<void>;
  save(changeSet: RecoveryAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
}

export interface RecoveryAggregateChangeSet {
  readonly recoveryRequest: RecoveryRequest;
  readonly evidence: readonly RecoveryEvidenceRecord[];
  readonly notifications: readonly RecoveryNotificationRecord[];
  readonly approvalsToAppend: readonly RecoveryApprovalRecord[];
  readonly attemptsToAppend: readonly RecoveryAttempt[];
  readonly transitionsToAppend: readonly RecoveryStateTransition[];
}
