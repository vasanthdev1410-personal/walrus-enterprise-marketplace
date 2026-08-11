export type ProvisioningErrorCode =
  | 'AUTHORIZATION_DENIED'
  | 'BOOTSTRAP_UNAVAILABLE'
  | 'RESOURCE_STATE_CONFLICT'
  | 'IDENTIFIER_INVALID'
  | 'IDENTIFIER_ALREADY_REGISTERED'
  | 'CLASSIFICATION_NOT_PERMITTED';

export class ProvisioningError extends Error {
  public constructor(public readonly code: ProvisioningErrorCode) {
    super(code);
    this.name = 'ProvisioningError';
  }
}
