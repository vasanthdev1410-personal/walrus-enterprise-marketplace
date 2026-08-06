export interface AccessTokenAuthenticationClaims {
  readonly subject: string;
  readonly sessionId: string;
  readonly jwtId: string;
  readonly authenticationMethods: readonly string[];
  readonly authenticationAssurance: string;
  readonly sessionVersion: number;
  readonly mfaState?: string;
  readonly deviceSessionId?: string;
  readonly correlationId?: string;
  readonly notBefore?: Date;
}

export interface VerifiedAccessTokenAuthenticationClaims extends AccessTokenAuthenticationClaims {
  readonly issuer: string;
  readonly audience: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface JsonWebKeySet {
  readonly keys: readonly {
    readonly kty: string;
    readonly crv: string;
    readonly use: 'sig';
    readonly alg: 'ES256';
    readonly kid: string;
    readonly x: string;
    readonly y: string;
  }[];
}

export interface JwtCryptographicPort {
  signAccessToken(claims: AccessTokenAuthenticationClaims): Promise<string>;
  verifyAccessToken(token: string): Promise<VerifiedAccessTokenAuthenticationClaims>;
  getPublicJsonWebKeySet(): Promise<JsonWebKeySet>;
}
