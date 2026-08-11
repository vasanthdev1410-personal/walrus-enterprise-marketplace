/**
 * Internal, non-sensitive denial reasons. Per Part 6.5 §24 these are never
 * exposed to clients or logged with sensitive context; they exist for internal
 * explainability and audit correlation only.
 */
export const AUTHORIZATION_DENIAL_REASONS = [
  'SUBJECT_NOT_RESOLVED',
  'UNKNOWN_PERMISSION',
  'RETIRED_PERMISSION',
  'NO_ACTIVE_ASSIGNMENT',
  'UNKNOWN_ROLE',
  'ROLE_NOT_ACTIVE',
  'PERMISSION_NOT_GRANTED',
  'EXPLICITLY_DENIED',
] as const;

export type AuthorizationDenialReason = (typeof AUTHORIZATION_DENIAL_REASONS)[number];
