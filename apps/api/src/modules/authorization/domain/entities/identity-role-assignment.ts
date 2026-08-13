import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { IdentityRoleAssignmentState } from '../value-objects/identity-role-assignment-state';
import type { RoleName } from '../value-objects/role-name';

/**
 * Part 6.2 §6/§9 (Module 02 source material). Binds an identity to a role.
 * Assignments are centrally created and revoked; only ACTIVE assignments may
 * contribute permissions, and a REVOKED assignment always fails closed.
 */
export interface IdentityRoleAssignmentProperties {
  readonly assignmentId: UuidV7;
  readonly identityId: UuidV7;
  readonly roleName: RoleName;
  readonly assignmentState: IdentityRoleAssignmentState;
  readonly assignedByIdentityId?: UuidV7;
  readonly assignmentOriginType?:
    | 'HUMAN_ADMINISTRATION'
    | 'PRIVILEGED_PROVISIONING'
    | 'CONTROLLED_BOOTSTRAP'
    | 'SELLER_LIFECYCLE';
  readonly assignedByWorkloadIdentity?: string;
  readonly authorityEvidenceReference?: string;
  readonly operationId?: UuidV7;
  readonly auditCorrelationId?: UuidV7;
  readonly assignedAt: Date;
  readonly activatedAt?: Date;
  readonly revokedByIdentityId?: UuidV7;
  readonly revokedAt?: Date;
  readonly revocationReasonReference?: string;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class IdentityRoleAssignment {
  public readonly properties: Readonly<IdentityRoleAssignmentProperties>;

  public constructor(properties: IdentityRoleAssignmentProperties) {
    const origin = properties.assignmentOriginType ?? 'HUMAN_ADMINISTRATION';
    if (origin === 'HUMAN_ADMINISTRATION' && properties.assignedByIdentityId === undefined) {
      throw new Error('Human role assignment requires assignedByIdentityId');
    }
    if (
      origin !== 'HUMAN_ADMINISTRATION' &&
      (properties.assignedByWorkloadIdentity === undefined ||
        properties.authorityEvidenceReference === undefined ||
        properties.operationId === undefined)
    ) {
      throw new Error('Control-plane role assignment requires workload and evidence provenance');
    }
    if (properties.assignmentState === 'REVOKED' && properties.revokedAt === undefined) {
      throw new Error('Revoked Identity Role Assignment requires revokedAt');
    }
    // Human-administered assignments always record the revoking identity.
    // Control-plane assignments (e.g. SELLER_LIFECYCLE activation rollback)
    // may be revoked by the control plane itself; the revocation audit record
    // carries the workload identity and reason code instead.
    if (
      properties.assignmentState === 'REVOKED' &&
      origin === 'HUMAN_ADMINISTRATION' &&
      properties.revokedByIdentityId === undefined
    ) {
      throw new Error('Revoked Identity Role Assignment requires revokedByIdentityId');
    }
    this.properties = Object.freeze({
      ...properties,
      assignmentOriginType: origin,
      activatedAt: properties.activatedAt ?? properties.assignedAt,
    });
    Object.freeze(this);
  }
}
