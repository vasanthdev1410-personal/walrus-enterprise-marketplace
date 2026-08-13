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
  // WEMP-M03-AUTHZ-001 §2 (approved D-11): canonical verbs required by the
  // seller permission vocabulary (immutable resource.action identifiers).
  'CLOSE',
  'SUBMIT',
  'DECIDE',
  'VIEW',
] as const;

export type AllowedAction = (typeof ALLOWED_ACTIONS)[number];
