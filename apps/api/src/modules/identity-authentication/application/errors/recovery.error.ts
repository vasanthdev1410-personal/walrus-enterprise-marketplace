export type RecoveryErrorCode =
  | 'RESOURCE_NOT_AVAILABLE'
  | 'RECOVERY_EVIDENCE_REJECTED'
  | 'RECOVERY_APPROVAL_NOT_REQUIRED'
  | 'RECOVERY_STATE_CONFLICT';

export class RecoveryError extends Error {
  public constructor(public readonly code: RecoveryErrorCode) {
    super(code);
    this.name = 'RecoveryError';
  }
}
