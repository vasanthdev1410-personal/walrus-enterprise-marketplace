import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type * as Jose from 'jose' with { 'resolution-mode': 'import' };
import type {
  TrustedPeerCertificatePort,
  TrustedWorkloadKeyResolverPort,
  TrustedWorkloadReplayPort,
  TrustedWorkloadVerifierPort,
  VerifyTrustedWorkloadCommand,
} from '../ports/trusted-workload.port';
import type { VerifiedWorkloadIdentityV1 } from '../contracts/trusted-boundary-v2';
import { TrustedBoundaryError } from '../errors/trusted-boundary.error';

const EXPECTED_AUDIENCE = 'urn:walrus:module-02:authorization';
const POLICY_VERSION = 'wemp.m02.m4.v1';
const CONTRACT_VERSION = 'wemp.m01-m02.authorization.v2';
const MAX_LIFETIME_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 60;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[A-Za-z0-9_-]{43}$/;

const BOUNDARY_CLAIMS: Partial<Record<VerifyTrustedWorkloadCommand['boundary'], string>> = {
  CLASSIFICATION_TRANSITION: 'classification-transition',
  PRIVILEGED_PROVISIONING: 'privileged-provisioning',
  CONTROLLED_BOOTSTRAP: 'controlled-bootstrap',
  IDENTITY_READINESS: 'identity-readiness',
} as const;

const ALLOWED_CLAIMS = new Set([
  'version',
  'iss',
  'sub',
  'aud',
  'environment',
  'boundary',
  'iat',
  'nbf',
  'exp',
  'jti',
  'nonce',
  'cnf',
  'requestBindingDigest',
  'policyVersion',
  'contractVersion',
  'operationId',
  'humanInitiator',
]);
const requireFromProject = createRequire(__filename);
let joseModule: typeof Jose | undefined;
export function loadTrustedJoseModule(): Promise<typeof Jose> {
  joseModule ??= requireFromProject('jose') as typeof Jose;
  return Promise.resolve(joseModule);
}

export class TrustedWorkloadVerifierService implements TrustedWorkloadVerifierPort {
  public constructor(
    private readonly keys: TrustedWorkloadKeyResolverPort,
    private readonly certificates: TrustedPeerCertificatePort,
    private readonly replay: TrustedWorkloadReplayPort,
  ) {}

  public async verify(command: VerifyTrustedWorkloadCommand): Promise<VerifiedWorkloadIdentityV1> {
    try {
      const { decodeProtectedHeader, jwtVerify } = await loadTrustedJoseModule();
      const header = decodeProtectedHeader(command.compactAssertion);
      if (
        Object.keys(header).sort().join(',') !== 'alg,kid,typ' ||
        header.alg !== 'ES256' ||
        header.typ !== 'JWT' ||
        typeof header.kid !== 'string' ||
        header.kid.length === 0
      )
        throw new TrustedBoundaryError('WI_HEADER_INVALID');

      const issuer = `urn:walrus:workload-identity:${command.expectedEnvironment}`;
      if (await this.keys.isKeyRevoked(issuer, header.kid)) {
        throw new TrustedBoundaryError('WI_KEY_REVOKED');
      }
      const key = await this.keys.resolveVerificationKey(issuer, header.kid);
      const verified = await jwtVerify(command.compactAssertion, key, {
        algorithms: ['ES256'],
        issuer,
        audience: EXPECTED_AUDIENCE,
        clockTolerance: CLOCK_SKEW_SECONDS,
        currentDate: command.now,
      });
      const claims = verified.payload;
      if (Object.keys(claims).some((name) => !ALLOWED_CLAIMS.has(name))) {
        throw new TrustedBoundaryError('WI_CLAIMS_INVALID');
      }
      const certificate = await this.certificates.validate({
        certificateDer: command.peerCertificateDer,
        environment: command.expectedEnvironment,
        now: command.now,
      });
      this.validateClaims(claims, command, certificate, header.kid);
      const requestDigest = sha256Base64Url(canonicalize(command.canonicalRequestBody));
      if (claims.requestBindingDigest !== requestDigest) {
        throw new TrustedBoundaryError('WI_REQUEST_BINDING_MISMATCH');
      }
      const assertionDigest = sha256Base64Url(command.compactAssertion);
      const reference = `wiv:${assertionDigest}`;
      const jwtId = String(claims.jti);
      const subject = String(claims.sub);
      const operationId = String(claims.operationId);
      const issuedAt = new Date(Number(claims.iat) * 1000);
      const expiresAt = new Date(Number(claims.exp) * 1000);
      await this.replay.consume({
        environment: command.expectedEnvironment,
        jwtId,
        workloadSubject: subject,
        boundary: command.boundary,
        assertionDigest,
        requestDigest,
        certificateThumbprint: certificate.thumbprint,
        operationId,
        expiresAt,
        auditReference: reference,
      });
      return {
        version: 'walrus.workload.v1',
        issuer,
        audience: EXPECTED_AUDIENCE,
        subject,
        environment: command.expectedEnvironment,
        operationId,
        contractVersion: CONTRACT_VERSION,
        requestDigest,
        certificateThumbprint: certificate.thumbprint,
        issuedAt,
        expiresAt,
        jwtId,
        keyId: header.kid,
        verificationReference: reference,
      };
    } catch (error) {
      if (error instanceof TrustedBoundaryError) throw error;
      throw new TrustedBoundaryError('WI_VERIFICATION_FAILED');
    }
  }

  private validateClaims(
    claims: Readonly<Record<string, unknown>> & {
      readonly iss?: string;
      readonly sub?: string;
      readonly aud?: string | readonly string[];
      readonly iat?: number;
      readonly nbf?: number;
      readonly exp?: number;
      readonly jti?: string;
    },
    command: VerifyTrustedWorkloadCommand,
    certificate: { readonly thumbprint: string; readonly uriSan: string },
    keyId: string,
  ): void {
    const expectedBoundary = BOUNDARY_CLAIMS[command.boundary];
    const cnf = claims.cnf as Record<string, unknown> | undefined;
    if (
      expectedBoundary === undefined ||
      claims.version !== 'walrus.workload.v1' ||
      claims.environment !== command.expectedEnvironment ||
      claims.boundary !== expectedBoundary ||
      claims.policyVersion !== POLICY_VERSION ||
      claims.contractVersion !== CONTRACT_VERSION ||
      typeof claims.sub !== 'string' ||
      !command.allowedSubjects.includes(claims.sub) ||
      certificate.uriSan !== claims.sub ||
      cnf?.['x5t#S256'] !== certificate.thumbprint ||
      typeof claims.iat !== 'number' ||
      typeof claims.nbf !== 'number' ||
      typeof claims.exp !== 'number' ||
      claims.nbf > claims.iat ||
      claims.iat > claims.exp ||
      claims.exp - claims.iat > MAX_LIFETIME_SECONDS ||
      typeof claims.jti !== 'string' ||
      !UUID_V7.test(claims.jti) ||
      typeof claims.nonce !== 'string' ||
      !NONCE.test(claims.nonce) ||
      typeof claims.requestBindingDigest !== 'string' ||
      !DIGEST.test(claims.requestBindingDigest) ||
      typeof claims.operationId !== 'string' ||
      !UUID_V7.test(claims.operationId) ||
      keyId.length > 128
    )
      throw new TrustedBoundaryError('WI_CLAIMS_INVALID');
  }
}

function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TrustedBoundaryError('REQUEST_CANONICALIZATION_FAILED');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(',')}}`;
  }
  throw new TrustedBoundaryError('REQUEST_CANONICALIZATION_FAILED');
}
