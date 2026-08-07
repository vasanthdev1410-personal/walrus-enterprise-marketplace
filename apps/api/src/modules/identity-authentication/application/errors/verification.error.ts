export type VerificationErrorCode =
  | 'VERIFICATION_NOT_PERMITTED'
  | 'CHALLENGE_INVALID_OR_EXPIRED'
  | 'CHALLENGE_ALREADY_ACTIVE'
  | 'RESOURCE_STATE_CONFLICT';

export class VerificationError extends Error {
  public constructor(public readonly code: VerificationErrorCode) {
    super(code);
    this.name = 'VerificationError';
  }
}
