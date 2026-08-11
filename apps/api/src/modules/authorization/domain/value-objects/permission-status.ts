/**
 * Part 6.2 §8 (Module 02 source material). Permission status. RETIRED
 * permissions never contribute to a grant.
 */
export const PERMISSION_STATUSES = ['ACTIVE', 'RETIRED'] as const;

export type PermissionStatus = (typeof PERMISSION_STATUSES)[number];
