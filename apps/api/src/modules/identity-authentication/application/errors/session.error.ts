export type SessionErrorCode = 'RESOURCE_NOT_AVAILABLE' | 'RESOURCE_STATE_CONFLICT';

export class SessionError extends Error {
  public constructor(public readonly code: SessionErrorCode) {
    super(code);
    this.name = 'SessionError';
  }
}
