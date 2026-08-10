export type RecoveryErrorCode = 'RESOURCE_NOT_AVAILABLE';

export class RecoveryError extends Error {
  public constructor(public readonly code: RecoveryErrorCode) {
    super(code);
    this.name = 'RecoveryError';
  }
}
