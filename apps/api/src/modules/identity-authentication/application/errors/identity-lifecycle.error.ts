export type IdentityLifecycleErrorCode =
  | 'AUTHORIZATION_DENIED'
  | 'RESOURCE_NOT_AVAILABLE'
  | 'RESOURCE_STATE_CONFLICT'
  | 'INVALID_IDENTITY_STATE_TRANSITION';

export class IdentityLifecycleError extends Error {
  public constructor(public readonly code: IdentityLifecycleErrorCode) {
    super(code);
    this.name = 'IdentityLifecycleError';
  }
}
