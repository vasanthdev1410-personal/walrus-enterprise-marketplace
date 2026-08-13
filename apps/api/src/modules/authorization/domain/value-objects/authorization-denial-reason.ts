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
  // WEMP-M03-AUTHZ-001 §4 / WEMP-M03-SPEC-001 §12.2 (D-11): organization-
  // scope resolution failures for seller.* self-service permissions. Denials
  // are internal only and never exposed to clients.
  'SCOPE_RESOLUTION_UNAVAILABLE',
  'SCOPE_RESOURCE_MISSING',
  'SCOPE_NOT_ASSOCIATED',
  'SCOPE_SELLER_TERMINAL',
] as const;

export type AuthorizationDenialReason = (typeof AUTHORIZATION_DENIAL_REASONS)[number];
