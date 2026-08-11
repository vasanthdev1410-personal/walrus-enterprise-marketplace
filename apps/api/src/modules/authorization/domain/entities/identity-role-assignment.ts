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
  readonly assignedByIdentityId: UuidV7;
  readonly assignedAt: Date;
  readonly revokedByIdentityId?: UuidV7;
  readonly revokedAt?: Date;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class IdentityRoleAssignment {
  public readonly properties: Readonly<IdentityRoleAssignmentProperties>;

  public constructor(properties: IdentityRoleAssignmentProperties) {
    if (properties.assignmentState === 'REVOKED' && properties.revokedAt === undefined) {
      throw new Error('Revoked Identity Role Assignment requires revokedAt');
    }
    if (properties.assignmentState === 'REVOKED' && properties.revokedByIdentityId === undefined) {
      throw new Error('Revoked Identity Role Assignment requires revokedByIdentityId');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
