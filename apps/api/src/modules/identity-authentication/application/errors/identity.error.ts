export type IdentityErrorCode =
  | 'IDENTITY_NOT_FOUND'
  | 'IDENTIFIER_ALREADY_REGISTERED'
  | 'INVALID_IDENTITY_STATE_TRANSITION'
  | 'IDENTITY_ALREADY_DEACTIVATED'
  | 'IDENTITY_ALREADY_PENDING_DELETION';

export class IdentityError extends Error {
  public constructor(public readonly code: IdentityErrorCode) {
    super(code);
    this.name = 'IdentityError';
  }
}
