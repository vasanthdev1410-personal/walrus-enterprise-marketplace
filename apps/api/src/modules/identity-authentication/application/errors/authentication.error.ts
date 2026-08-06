export type AuthenticationErrorCode =
  'AUTHENTICATION_FAILED' | 'REFRESH_TOKEN_INVALID' | 'TOKEN_REUSE_DETECTED' | 'SESSION_INVALID';

export class AuthenticationError extends Error {
  public constructor(public readonly code: AuthenticationErrorCode) {
    super(code);
    this.name = 'AuthenticationError';
  }
}
