import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { IdentityRoleAssignment } from '../entities/identity-role-assignment';

/**
 * Part 6.2 §6/§9 (Module 02 source material). Persistence port for identity
 * role assignments. Assignments are centrally created and revoked; only ACTIVE
 * assignments may contribute permissions. Writes are version-checked so a
 * stale or concurrent revocation/assignment is rejected.
 */
export interface IdentityRoleAssignmentRepository {
  findById(assignmentId: UuidV7): Promise<IdentityRoleAssignment | null>;
  findByIdentityId(identityId: UuidV7): Promise<readonly IdentityRoleAssignment[]>;
  findActiveByIdentityId(identityId: UuidV7): Promise<readonly IdentityRoleAssignment[]>;
  insert(assignment: IdentityRoleAssignment): Promise<void>;
  /** Version-checked state change (optimistic concurrency). */
  save(assignment: IdentityRoleAssignment): Promise<void>;
}
