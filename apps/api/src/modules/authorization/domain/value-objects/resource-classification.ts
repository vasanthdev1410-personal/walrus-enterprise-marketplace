/**
 * Part 6.3 §11 (Module 02 source material). Every protected resource belongs to
 * exactly one classification. Authorization decisions consider classification
 * together with approved roles and permissions; no classification-based policy
 * matrix is approved for Phase 1, so the engine treats classification as an
 * input contract only.
 */
export const RESOURCE_CLASSIFICATIONS = [
  'PUBLIC',
  'PROTECTED',
  'RESTRICTED',
  'CONFIDENTIAL',
  'SYSTEM',
] as const;

export type ResourceClassification = (typeof RESOURCE_CLASSIFICATIONS)[number];
