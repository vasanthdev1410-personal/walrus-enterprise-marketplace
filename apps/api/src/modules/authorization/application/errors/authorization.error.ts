/**
 * Part 6.5 §24 (Module 02 source material). Standardized, non-sensitive
 * authorization error codes. Responses never expose internal policy, role or
 * permission configuration.
 */
export type AuthorizationErrorCode =
  | 'AUTHORIZATION_DENIED'
  | 'ROLE_UNKNOWN'
  | 'ROLE_NOT_ACTIVE'
  | 'ROLE_RETIRED'
  | 'ALREADY_ASSIGNED'
  | 'ASSIGNMENT_NOT_FOUND'
  | 'ALREADY_REVOKED'
  | 'TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE'
  | 'STALE_VERSION';

export class AuthorizationError extends Error {
  public constructor(public readonly code: AuthorizationErrorCode) {
    super(code);
    this.name = 'AuthorizationError';
  }
}
