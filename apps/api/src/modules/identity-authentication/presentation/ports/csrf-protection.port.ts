export interface CsrfTokenPair {
  readonly cookieToken: string;
  readonly headerToken: string;
}

export interface CsrfProtectionPort {
  verify(pair: CsrfTokenPair): boolean;
  issue(): string;
}
