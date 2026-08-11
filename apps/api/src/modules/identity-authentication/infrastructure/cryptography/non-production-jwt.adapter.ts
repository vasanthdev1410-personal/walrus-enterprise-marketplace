import type { KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type * as Jose from 'jose' with { 'resolution-mode': 'import' };
import type {
  AccessTokenAuthenticationClaims,
  JsonWebKeySet,
  JwtCryptographicPort,
  VerifiedAccessTokenAuthenticationClaims,
} from '../../application/ports/jwt-cryptographic.port';
import type { IdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';

type SigningKey = KeyObject | CryptoKey;
type VerificationKey = KeyObject | CryptoKey;

const APPROVED_PAYLOAD_CLAIMS = new Set([
  'sub',
  'sid',
  'jti',
  'iss',
  'aud',
  'iat',
  'exp',
  'nbf',
  'amr',
  'acr',
  'mfaState',
  'deviceSessionId',
  'correlationId',
  'sessionVersion',
]);

// JOSE v6 is ESM-only while the NestJS application is CommonJS. Node 26, the
// repository floor for both the production image (node:26.6.0-alpine) and CI,
// supports require() of ESM modules natively, so a createRequire-scoped require
// loads jose through Node's own module loader. This deliberately avoids a
// vm-routed dynamic import (import()) from CommonJS: Jest attributes such an
// import to the test file that first compiled the module, so a later test file
// reusing the same worker fails with "import a file after the Jest environment
// has been torn down" (jest-runtime bailIfTornDown).
const requireFromProject = createRequire(__filename);

// The jose module is stateless, so it is resolved once per module evaluation
// and reused by every caller.
let joseModule: typeof Jose | undefined;

export function loadJoseModule(): Promise<typeof Jose> {
  joseModule ??= requireFromProject('jose') as typeof Jose;
  return Promise.resolve(joseModule);
}

export class NonProductionJwtAdapter implements JwtCryptographicPort {
  public constructor(
    private readonly configuration: IdentityAuthenticationConfiguration,
    private readonly signingKey: SigningKey,
    private readonly verificationKey: VerificationKey,
  ) {}

  public static async fromPemFileReferences(
    configuration: IdentityAuthenticationConfiguration,
    applicationEnvironment: string,
  ): Promise<NonProductionJwtAdapter> {
    if (applicationEnvironment === 'production') {
      throw new Error('The non-production JWT adapter is prohibited in production');
    }

    const jose = await loadJoseModule();
    const [privatePem, publicPem] = await Promise.all([
      readFile(configuration.jwt.signingKeyReference, 'utf8'),
      readFile(configuration.jwt.verificationKeySetReference, 'utf8'),
    ]);
    const [signingKey, verificationKey] = await Promise.all([
      jose.importPKCS8(privatePem, 'ES256'),
      jose.importSPKI(publicPem, 'ES256'),
    ]);
    return new NonProductionJwtAdapter(configuration, signingKey, verificationKey);
  }

  public async signAccessToken(claims: AccessTokenAuthenticationClaims): Promise<string> {
    this.assertInputClaims(claims);
    const jose = await loadJoseModule();
    const issuedAtSeconds = Math.floor(Date.now() / 1_000);
    const payload = {
      sid: claims.sessionId,
      amr: [...claims.authenticationMethods],
      acr: claims.authenticationAssurance,
      sessionVersion: claims.sessionVersion,
      ...(claims.mfaState === undefined ? {} : { mfaState: claims.mfaState }),
      ...(claims.deviceSessionId === undefined ? {} : { deviceSessionId: claims.deviceSessionId }),
      ...(claims.correlationId === undefined ? {} : { correlationId: claims.correlationId }),
    };

    let token = new jose.SignJWT(payload)
      .setProtectedHeader({
        alg: this.configuration.jwt.algorithm,
        kid: this.configuration.jwt.signingKeyId,
        typ: 'JWT',
      })
      .setSubject(claims.subject)
      .setJti(claims.jwtId)
      .setIssuer(this.configuration.jwt.issuer)
      .setAudience(this.configuration.jwt.audience)
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(issuedAtSeconds + this.configuration.jwt.accessTokenLifetimeSeconds);

    if (claims.notBefore !== undefined) {
      token = token.setNotBefore(Math.floor(claims.notBefore.getTime() / 1_000));
    }

    return token.sign(this.signingKey);
  }

  public async verifyAccessToken(token: string): Promise<VerifiedAccessTokenAuthenticationClaims> {
    const jose = await loadJoseModule();
    const result = await jose.jwtVerify(token, this.verificationKey, {
      algorithms: [this.configuration.jwt.algorithm],
      issuer: this.configuration.jwt.issuer,
      audience: this.configuration.jwt.audience,
      clockTolerance: this.configuration.jwt.clockSkewSeconds,
      typ: 'JWT',
      requiredClaims: ['sub', 'sid', 'jti', 'iat', 'exp', 'amr', 'acr', 'sessionVersion'],
    });

    if (result.protectedHeader.kid !== this.configuration.jwt.signingKeyId) {
      throw new Error('JWT signing key identifier is not approved');
    }
    this.assertApprovedPayload(result.payload);

    const { sub, sid, jti, iss, aud, iat, exp, nbf, amr, acr, sessionVersion } = result.payload;
    if (
      typeof sub !== 'string' ||
      typeof sid !== 'string' ||
      typeof jti !== 'string' ||
      typeof iss !== 'string' ||
      typeof aud !== 'string' ||
      typeof iat !== 'number' ||
      typeof exp !== 'number' ||
      !Array.isArray(amr) ||
      !amr.every((method) => typeof method === 'string') ||
      typeof acr !== 'string' ||
      !Number.isSafeInteger(sessionVersion)
    ) {
      throw new Error('JWT contains invalid authentication claim types');
    }

    return {
      subject: sub,
      sessionId: sid,
      jwtId: jti,
      issuer: iss,
      audience: aud,
      issuedAt: new Date(iat * 1_000),
      expiresAt: new Date(exp * 1_000),
      authenticationMethods: amr,
      authenticationAssurance: acr,
      sessionVersion: sessionVersion as number,
      ...(typeof result.payload.mfaState === 'string' ? { mfaState: result.payload.mfaState } : {}),
      ...(typeof result.payload.deviceSessionId === 'string'
        ? { deviceSessionId: result.payload.deviceSessionId }
        : {}),
      ...(typeof result.payload.correlationId === 'string'
        ? { correlationId: result.payload.correlationId }
        : {}),
      ...(typeof nbf === 'number' ? { notBefore: new Date(nbf * 1_000) } : {}),
    };
  }

  public async getPublicJsonWebKeySet(): Promise<JsonWebKeySet> {
    const jose = await loadJoseModule();
    const exported = await jose.exportJWK(this.verificationKey);
    if (
      exported.kty !== 'EC' ||
      exported.crv !== 'P-256' ||
      typeof exported.x !== 'string' ||
      typeof exported.y !== 'string'
    ) {
      throw new Error('Verification key is not an approved ES256 public key');
    }
    return {
      keys: [
        {
          kty: exported.kty,
          crv: exported.crv,
          x: exported.x,
          y: exported.y,
          use: 'sig',
          alg: 'ES256',
          kid: this.configuration.jwt.signingKeyId,
        },
      ],
    };
  }

  private assertApprovedPayload(payload: Readonly<Record<string, unknown>>): void {
    const unexpectedClaim = Object.keys(payload).find(
      (claimName) => !APPROVED_PAYLOAD_CLAIMS.has(claimName),
    );
    if (unexpectedClaim !== undefined) {
      throw new Error(`JWT contains an unapproved claim: ${unexpectedClaim}`);
    }
  }

  private assertInputClaims(claims: AccessTokenAuthenticationClaims): void {
    if (
      claims.subject.length === 0 ||
      claims.sessionId.length === 0 ||
      claims.jwtId.length === 0 ||
      claims.authenticationMethods.length === 0 ||
      claims.authenticationAssurance.length === 0 ||
      !Number.isSafeInteger(claims.sessionVersion) ||
      claims.sessionVersion < 1
    ) {
      throw new Error('Access Token authentication claims are incomplete');
    }
  }
}
