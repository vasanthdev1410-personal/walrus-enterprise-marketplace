export type PasswordResetErrorCode =
  'RECOVERY_OPERATION_NOT_PERMITTED' | 'RECOVERY_STATE_CONFLICT' | 'PASSWORD_POLICY_FAILED';

export class PasswordResetError extends Error {
  public constructor(public readonly code: PasswordResetErrorCode) {
    super(code);
    this.name = 'PasswordResetError';
  }
}
