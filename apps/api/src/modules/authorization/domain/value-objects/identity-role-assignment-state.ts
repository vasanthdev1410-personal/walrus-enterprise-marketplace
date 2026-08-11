/**
 * Identity-role assignment states. Only ACTIVE assignments may contribute
 * permissions; REVOKED assignments fail closed during authorization.
 */
export const IDENTITY_ROLE_ASSIGNMENT_STATES = ['ACTIVE', 'REVOKED'] as const;

export type IdentityRoleAssignmentState = (typeof IDENTITY_ROLE_ASSIGNMENT_STATES)[number];
