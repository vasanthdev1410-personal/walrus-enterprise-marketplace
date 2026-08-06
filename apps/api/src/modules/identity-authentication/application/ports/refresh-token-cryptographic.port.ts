export interface IssuedRefreshToken {
  readonly rawToken: string;
  readonly digest: string;
  readonly keyVersion: string;
}

export interface RefreshTokenCryptographicPort {
  issue(): IssuedRefreshToken;
  computeDigest(rawToken: string): string;
  matches(rawToken: string, storedDigest: string): boolean;
}
