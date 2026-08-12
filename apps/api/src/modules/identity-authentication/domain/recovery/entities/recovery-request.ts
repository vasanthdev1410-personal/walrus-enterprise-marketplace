import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { PermittedRecoveryOperation } from '../value-objects/permitted-recovery-operation';
import type { RecoveryAssuranceLevel } from '../value-objects/recovery-assurance-level';
import type { RecoveryOperationClass } from '../value-objects/recovery-operation-class';
import type { RecoveryPolicyVersion } from '../value-objects/recovery-policy-version';
import type { RecoveryState } from '../value-objects/recovery-state';

export interface RecoveryRequestProperties {
  recoveryRequestId: UuidV7;
  identityId: UuidV7;
  operationClass: RecoveryOperationClass;
  recoveryState: RecoveryState;
  recoveryAssurance: RecoveryAssuranceLevel;
  recoveryPolicyVersion: RecoveryPolicyVersion;
  permittedOperation: PermittedRecoveryOperation;
  stateVersion: number;
  expiresAt: Date;
  aggregateVersion: AggregateVersion;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  executionStartedAt?: Date;
  completedAt?: Date;
  terminalReason?: string;
  idempotencyKey?: string;
  correlationId?: CorrelationIdentifier;
  requesterKind?: 'AUTHENTICATED_IDENTITY' | 'BOUND_RECOVERY_SESSION';
  requesterReference?: string;
  requesterIdentityId?: UuidV7;
}

export class RecoveryRequest {
  public readonly properties: Readonly<RecoveryRequestProperties>;

  public constructor(properties: RecoveryRequestProperties) {
    if (!Number.isSafeInteger(properties.stateVersion) || properties.stateVersion < 1) {
      throw new Error('Recovery Request state version must be positive');
    }
    if (properties.expiresAt <= properties.createdAt) {
      throw new Error('Recovery Request must expire after creation');
    }
    if (
      (properties.requesterKind === undefined) !==
      (properties.requesterReference === undefined)
    ) {
      throw new Error('Recovery requester provenance must be complete');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
