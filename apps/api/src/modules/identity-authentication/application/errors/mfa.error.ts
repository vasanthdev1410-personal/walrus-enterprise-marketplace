export type MfaErrorCode =
  | 'MFA_ENROLLMENT_NOT_PERMITTED'
  | 'CHALLENGE_INVALID_OR_EXPIRED'
  | 'RESOURCE_STATE_CONFLICT';

export class MfaError extends Error {
  public constructor(public readonly code: MfaErrorCode) {
    super(code);
    this.name = 'MfaError';
  }
}
