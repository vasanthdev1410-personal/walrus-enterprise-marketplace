export type RegistrationErrorCode =
  | 'IDENTIFIER_ALREADY_REGISTERED'
  | 'REGISTRATION_NOT_FOUND'
  | 'REGISTRATION_STATE_CONFLICT'
  | 'CHALLENGE_INVALID_OR_EXPIRED'
  | 'CHALLENGE_ALREADY_ACTIVE'
  | 'REGISTRATION_NOT_READY'
  | 'VERIFICATION_NOT_PERMITTED';

export class RegistrationError extends Error {
  public constructor(public readonly code: RegistrationErrorCode) {
    super(code);
    this.name = 'RegistrationError';
  }
}
