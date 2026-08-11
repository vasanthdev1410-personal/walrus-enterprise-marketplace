/**
 * Part 6.2 §6 (Module 02 source material). The Phase-1 approved identity
 * roles. Roles define functional responsibilities; they do not authenticate an
 * identity and never grant permissions by themselves.
 */
export const ROLE_NAMES = ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
