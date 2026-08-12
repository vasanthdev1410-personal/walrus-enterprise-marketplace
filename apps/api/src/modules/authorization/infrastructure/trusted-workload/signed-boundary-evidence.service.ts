import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { JWTPayload } from 'jose' with { 'resolution-mode': 'import' };
import { TRUSTED_WORKLOAD_KEY_RESOLVER } from '../../authorization.tokens';
import type { TrustedWorkloadKeyResolverPort } from '../../application/ports/trusted-workload.port';
import { TrustedBoundaryError } from '../../application/errors/trusted-boundary.error';
import { loadTrustedJoseModule } from '../../application/services/trusted-workload-verifier.service';
import type { M4Environment } from '../../application/contracts/trusted-boundary-v2';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const POLICY = 'wemp.m02.m4.v1';

const PRV_CLAIMS = new Set([
  'version',
  'issuer',
  'audience',
  'subjectIdentityId',
  'requestedClassification',
  'requestedRole',
  'environment',
  'operation',
  'operationId',
  'policyVersion',
  'issuedAt',
  'expiresAt',
  'jwtId',
  'approverIdentityIds',
  'keyId',
]);
const BSV_CLAIMS = new Set([
  'version',
  'issuer',
  'audience',
  'environment',
  'intendedIdentityId',
  'intendedIdentifierReferences',
  'requestedClassification',
  'requestedRole',
  'securityAuthorityId',
  'operationsAuthorityId',
  'operationId',
  'policyVersion',
  'issuedAt',
  'notBefore',
  'expiresAt',
  'jwtId',
  'keyId',
]);
const READINESS_CLAIMS = new Set([
  'version',
  'issuer',
  'audience',
  'subject',
  'identityId',
  'requestType',
  'provisioningRequestId',
  'bootstrapRequestId',
  'identityState',
  'identityVerificationState',
  'identifierVerificationState',
  'credentialReady',
  'mfaEnrollmentState',
  'recoveryCodeSetState',
  'aalCapability',
  'classification',
  'authenticationControlVersion',
  'identityAggregateVersion',
  'classificationAggregateVersion',
  'issuedAt',
  'notBefore',
  'expiresAt',
  'jwtId',
  'nonce',
  'environment',
  'policyVersion',
  'correlationId',
  'operationId',
  'keyId',
  'requestBindingDigest',
]);

export interface VerifiedReadinessEvidence {
  readonly digest: string;
  readonly verificationReference: string;
  readonly jwtId: string;
  readonly identityId: string;
  readonly operationId: string;
  readonly requestId: string;
  readonly requestType: 'PROVISIONING' | 'BOOTSTRAP';
  readonly classification: 'PRIVILEGED_ADMIN_AUTHENTICATION' | 'SUPER_ADMIN_AUTHENTICATION';
  readonly identityVersion: number;
  readonly controlVersion: number;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

@Injectable()
export class SignedBoundaryEvidenceService {
  public constructor(
    @Inject(TRUSTED_WORKLOAD_KEY_RESOLVER)
    private readonly keys: TrustedWorkloadKeyResolverPort,
  ) {}

  public async verifyProvisioning(input: {
    readonly compact: string;
    readonly environment: M4Environment;
    readonly operationId: string;
    readonly now: Date;
  }): Promise<string> {
    const claims = await this.verifySignature(
      input.compact,
      'urn:walrus:module-02:provisioning-authority',
      PRV_CLAIMS,
    );
    const issuedAt = dateClaim(claims.issuedAt);
    const expiresAt = dateClaim(claims.expiresAt);
    if (
      claims.version !== 'walrus.provisioning.v1' ||
      claims.issuer !== 'urn:walrus:module-02:provisioning-authority' ||
      claims.audience !== 'urn:walrus:module-01:privileged-provisioning' ||
      claims.environment !== input.environment ||
      claims.operationId !== input.operationId ||
      claims.policyVersion !== POLICY ||
      !UUID_V7.test(String(claims.subjectIdentityId)) ||
      !UUID_V7.test(String(claims.jwtId)) ||
      !Array.isArray(claims.approverIdentityIds) ||
      expiresAt <= input.now ||
      issuedAt > input.now ||
      expiresAt.getTime() - issuedAt.getTime() > 300_000
    )
      throw new TrustedBoundaryError('PRV1_INVALID');
    return sha256(input.compact);
  }

  public async verifyBootstrap(input: {
    readonly compact: string;
    readonly environment: M4Environment;
    readonly operationId: string;
    readonly now: Date;
  }): Promise<string> {
    const claims = await this.verifySignature(
      input.compact,
      'urn:walrus:bootstrap-control-plane',
      BSV_CLAIMS,
    );
    const issuedAt = dateClaim(claims.issuedAt);
    const notBefore = claims.notBefore === undefined ? issuedAt : dateClaim(claims.notBefore);
    const expiresAt = dateClaim(claims.expiresAt);
    if (
      claims.version !== 'walrus.bootstrap.v1' ||
      claims.issuer !== 'urn:walrus:bootstrap-control-plane' ||
      claims.audience !== 'urn:walrus:module-01:bootstrap' ||
      claims.environment !== input.environment ||
      claims.operationId !== input.operationId ||
      claims.policyVersion !== POLICY ||
      claims.requestedClassification !== 'SUPER_ADMIN_AUTHENTICATION' ||
      claims.requestedRole !== 'SUPER_ADMIN' ||
      claims.securityAuthorityId === claims.operationsAuthorityId ||
      !UUID_V7.test(String(claims.intendedIdentityId)) ||
      !UUID_V7.test(String(claims.jwtId)) ||
      !Array.isArray(claims.intendedIdentifierReferences) ||
      input.now < notBefore ||
      expiresAt <= input.now ||
      issuedAt > input.now ||
      expiresAt.getTime() - issuedAt.getTime() > 600_000
    )
      throw new TrustedBoundaryError('BSV1_INVALID');
    return sha256(input.compact);
  }

  public async verifyReadiness(input: {
    readonly compact: string;
    readonly environment: M4Environment;
    readonly expectedAudience: string;
    readonly operationId: string;
    readonly expectedRequestId: string;
    readonly expectedIdentityId: string;
    readonly expectedClassification: string;
    readonly now: Date;
  }): Promise<VerifiedReadinessEvidence> {
    const issuer = `urn:walrus:module-01:identity-readiness:${input.environment}`;
    const claims = await this.verifySignature(input.compact, issuer, READINESS_CLAIMS);
    const issuedAt = dateClaim(claims.issuedAt);
    const notBefore = dateClaim(claims.notBefore);
    const expiresAt = dateClaim(claims.expiresAt);
    const requestType =
      claims.requestType === 'PRIVILEGED_PROVISIONING'
        ? 'PROVISIONING'
        : claims.requestType === 'CONTROLLED_BOOTSTRAP'
          ? 'BOOTSTRAP'
          : undefined;
    const requestId =
      requestType === 'PROVISIONING'
        ? claims.provisioningRequestId
        : requestType === 'BOOTSTRAP'
          ? claims.bootstrapRequestId
          : undefined;
    const hasCorrectExclusiveId =
      requestType === 'PROVISIONING'
        ? claims.bootstrapRequestId === undefined
        : requestType === 'BOOTSTRAP'
          ? claims.provisioningRequestId === undefined
          : false;
    if (requestType === undefined || requestId === undefined)
      throw new TrustedBoundaryError('READINESS_INVALID');
    if (
      claims.version !== 'walrus.identity-readiness.v1' ||
      claims.issuer !== issuer ||
      claims.audience !== input.expectedAudience ||
      claims.subject !== 'urn:walrus:service:module-01-identity-readiness' ||
      claims.environment !== input.environment ||
      claims.operationId !== input.operationId ||
      claims.identityId !== input.expectedIdentityId ||
      claims.classification !== input.expectedClassification ||
      claims.policyVersion !== POLICY ||
      requestId !== input.expectedRequestId ||
      !hasCorrectExclusiveId ||
      claims.identityState !== 'ACTIVE' ||
      claims.identityVerificationState !== 'VERIFIED' ||
      claims.identifierVerificationState !== 'VERIFIED' ||
      claims.credentialReady !== true ||
      claims.mfaEnrollmentState !== 'ACTIVE' ||
      !['ACTIVE', 'NOT_REQUIRED'].includes(String(claims.recoveryCodeSetState)) ||
      claims.aalCapability !== 'AAL2_CAPABLE' ||
      typeof claims.jwtId !== 'string' ||
      typeof claims.nonce !== 'string' ||
      typeof claims.operationId !== 'string' ||
      !UUID_V7.test(claims.identityId) ||
      !UUID_V7.test(requestId) ||
      !UUID_V7.test(claims.jwtId) ||
      !NONCE.test(claims.nonce) ||
      !Number.isInteger(claims.authenticationControlVersion) ||
      !Number.isInteger(claims.identityAggregateVersion) ||
      !Number.isInteger(claims.classificationAggregateVersion) ||
      input.now < notBefore ||
      expiresAt <= input.now ||
      issuedAt > input.now ||
      expiresAt.getTime() - issuedAt.getTime() > 300_000
    )
      throw new TrustedBoundaryError('READINESS_INVALID');
    const canonical = {
      version: 'walrus.identity-readiness.v1',
      identityId: claims.identityId.toLowerCase(),
      classification: claims.classification,
      environment: claims.environment,
      request: { type: requestType, id: requestId.toLowerCase() },
      controls: {
        identifierVerified: true,
        credentialReady: true,
        mfaReady: true,
        identityActive: true,
      },
    };
    if (claims.requestBindingDigest !== sha256(canonicalize(canonical)))
      throw new TrustedBoundaryError('READINESS_DIGEST_MISMATCH');
    const digest = sha256(input.compact);
    return {
      digest,
      verificationReference: `rdv:${digest}`,
      jwtId: claims.jwtId,
      identityId: claims.identityId,
      operationId: claims.operationId,
      requestId,
      requestType,
      classification: claims.classification as VerifiedReadinessEvidence['classification'],
      identityVersion: Number(claims.identityAggregateVersion),
      controlVersion: Number(claims.authenticationControlVersion),
      issuedAt,
      expiresAt,
    };
  }

  private async verifySignature(
    compact: string,
    issuer: string,
    allowedClaims: ReadonlySet<string>,
  ): Promise<JWTPayload & Readonly<Record<string, unknown>>> {
    try {
      const { decodeProtectedHeader, jwtVerify } = await loadTrustedJoseModule();
      const header = decodeProtectedHeader(compact);
      if (
        Object.keys(header).sort().join(',') !== 'alg,kid,typ' ||
        header.alg !== 'ES256' ||
        header.typ !== 'JWT' ||
        typeof header.kid !== 'string' ||
        !header.kid
      )
        throw new TrustedBoundaryError('EVIDENCE_HEADER_INVALID');
      if (await this.keys.isKeyRevoked(issuer, header.kid))
        throw new TrustedBoundaryError('EVIDENCE_KEY_REVOKED');
      const key = await this.keys.resolveVerificationKey(issuer, header.kid);
      const verified = await jwtVerify(compact, key, { algorithms: ['ES256'] });
      const claims = verified.payload as JWTPayload & Readonly<Record<string, unknown>>;
      if (
        Object.keys(claims).some((claim) => !allowedClaims.has(claim)) ||
        claims.keyId !== header.kid
      )
        throw new TrustedBoundaryError('EVIDENCE_KEY_ID_MISMATCH');
      return claims;
    } catch (error) {
      if (error instanceof TrustedBoundaryError) throw error;
      throw new TrustedBoundaryError('EVIDENCE_SIGNATURE_INVALID');
    }
  }
}

function dateClaim(value: unknown): Date {
  if (typeof value !== 'string') throw new TrustedBoundaryError('EVIDENCE_TIME_INVALID');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value)
    throw new TrustedBoundaryError('EVIDENCE_TIME_INVALID');
  return parsed;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TrustedBoundaryError('CANONICALIZATION_FAILED');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(',')}}`;
  throw new TrustedBoundaryError('CANONICALIZATION_FAILED');
}
