/**
 * Part 6.2 §8 (Module 02 source material). The allowed-action categories a
 * permission may govern. Implicit permissions are prohibited: every grant must
 * be traceable to an explicit permission of this shape.
 */
export const ALLOWED_ACTIONS = [
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'REJECT',
  'EXPORT',
  'CONFIGURE',
  'AUDIT',
  'MANAGE',
] as const;

export type AllowedAction = (typeof ALLOWED_ACTIONS)[number];
