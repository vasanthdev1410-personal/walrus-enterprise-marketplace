export type CredentialErrorCode =
  | 'CURRENT_CREDENTIAL_INVALID'
  | 'PASSWORD_POLICY_FAILED'
  | 'RESOURCE_STATE_CONFLICT';

export class CredentialError extends Error {
  public constructor(public readonly code: CredentialErrorCode) {
    super(code);
    this.name = 'CredentialError';
  }
}
