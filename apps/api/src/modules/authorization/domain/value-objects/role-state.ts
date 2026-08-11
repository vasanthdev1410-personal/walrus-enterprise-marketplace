/**
 * Part 6.2 §10 (Module 02 source material). Role lifecycle:
 * Created → Configured → Active | Suspended | Retired. Retired roles must not
 * be assigned to new identities and never contribute permissions.
 */
export const ROLE_STATES = ['CREATED', 'CONFIGURED', 'ACTIVE', 'SUSPENDED', 'RETIRED'] as const;

export type RoleState = (typeof ROLE_STATES)[number];
