import type { AuthorizationDecisionRecord } from '../../domain/entities/authorization-decision-record';
import type { IdentityRoleAssignment } from '../../domain/entities/identity-role-assignment';

/**
 * Atomic persistence boundary for security-sensitive role mutations and their
 * mandatory audit evidence. Implementations must commit both records or none.
 */
export interface AuthorizationMutationPort {
  assignRoleWithAudit(
    assignment: IdentityRoleAssignment,
    auditRecord: AuthorizationDecisionRecord,
  ): Promise<void>;

  revokeRoleWithAudit(
    assignment: IdentityRoleAssignment,
    auditRecord: AuthorizationDecisionRecord,
  ): Promise<void>;
}
