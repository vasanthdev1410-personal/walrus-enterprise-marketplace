import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { PermittedRecoveryOperation } from '../value-objects/permitted-recovery-operation';
import type { RecoveryApprovalDecision } from '../value-objects/recovery-approval-decision';

export interface RecoveryApprovalRecordProperties {
  recoveryApprovalId: UuidV7;
  recoveryRequestId: UuidV7;
  recoveredIdentityId: UuidV7;
  operation: PermittedRecoveryOperation;
  approverIdentityId: UuidV7;
  approverAuthenticationEvidenceReference: ProtectedValue;
  decision: RecoveryApprovalDecision;
  decidedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export class RecoveryApprovalRecord {
  public readonly properties: Readonly<RecoveryApprovalRecordProperties>;

  public constructor(properties: RecoveryApprovalRecordProperties) {
    if (properties.approverIdentityId === properties.recoveredIdentityId) {
      throw new Error('Recovery approver must be independent from recovered Identity');
    }
    if (properties.expiresAt <= properties.createdAt) {
      throw new Error('Recovery Approval must expire after creation');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
