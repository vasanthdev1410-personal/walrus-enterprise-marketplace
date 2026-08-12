import { createHash } from 'node:crypto';
import type { TrustedWorkloadKeyResolverPort } from '../../application/ports/trusted-workload.port';
import { SignedBoundaryEvidenceService } from './signed-boundary-evidence.service';
import { loadTrustedJoseModule } from '../../application/services/trusted-workload-verifier.service';

const NOW = new Date('2026-08-12T10:00:00.000Z');
const OPERATION_ID = '0191310f-789a-7123-8123-000000000001';
const IDENTITY_ID = '0191310f-789a-7123-8123-000000000002';
const REQUEST_ID = '0191310f-789a-7123-8123-000000000003';
const JWT_ID = '0191310f-789a-7123-8123-000000000004';

describe('SignedBoundaryEvidenceService', () => {
  let service: SignedBoundaryEvidenceService;
  let privateKey: CryptoKey;

  beforeAll(async () => {
    const { generateKeyPair } = await loadTrustedJoseModule();
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    const keys: TrustedWorkloadKeyResolverPort = {
      resolveVerificationKey: jest.fn().mockResolvedValue(pair.publicKey),
      isKeyRevoked: jest.fn().mockResolvedValue(false),
    };
    service = new SignedBoundaryEvidenceService(keys);
  });

  it('accepts PRV1 only when protected kid and signed payload keyId agree', async () => {
    const compact = await sign({
      version: 'walrus.provisioning.v1',
      issuer: 'urn:walrus:module-02:provisioning-authority',
      audience: 'urn:walrus:module-01:privileged-provisioning',
      subjectIdentityId: IDENTITY_ID,
      requestedClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      requestedRole: 'ADMIN',
      environment: 'development',
      operation: 'PROVISION',
      operationId: OPERATION_ID,
      policyVersion: 'wemp.m02.m4.v1',
      issuedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      jwtId: JWT_ID,
      approverIdentityIds: [REQUEST_ID],
      keyId: 'active-1',
    });
    await expect(
      service.verifyProvisioning({
        compact,
        environment: 'development',
        operationId: OPERATION_ID,
        now: NOW,
      }),
    ).resolves.toBe(createHash('sha256').update(compact).digest('base64url'));
  });

  it('fails closed when protected kid and payload keyId differ', async () => {
    const compact = await sign({
      version: 'walrus.provisioning.v1',
      issuer: 'urn:walrus:module-02:provisioning-authority',
      audience: 'urn:walrus:module-01:privileged-provisioning',
      subjectIdentityId: IDENTITY_ID,
      requestedClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      requestedRole: 'ADMIN',
      environment: 'development',
      operation: 'PROVISION',
      operationId: OPERATION_ID,
      policyVersion: 'wemp.m02.m4.v1',
      issuedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      jwtId: JWT_ID,
      approverIdentityIds: [REQUEST_ID],
      keyId: 'different-key',
    });
    await expect(
      service.verifyProvisioning({
        compact,
        environment: 'development',
        operationId: OPERATION_ID,
        now: NOW,
      }),
    ).rejects.toMatchObject({ reasonCode: 'EVIDENCE_KEY_ID_MISMATCH' });
  });

  it('verifies a short-lived dual-authority BSV1 assertion', async () => {
    const compact = await sign({
      version: 'walrus.bootstrap.v1',
      issuer: 'urn:walrus:bootstrap-control-plane',
      audience: 'urn:walrus:module-01:bootstrap',
      environment: 'development',
      intendedIdentityId: IDENTITY_ID,
      intendedIdentifierReferences: ['identifier:1'],
      requestedClassification: 'SUPER_ADMIN_AUTHENTICATION',
      requestedRole: 'SUPER_ADMIN',
      securityAuthorityId: 'security:1',
      operationsAuthorityId: 'operations:1',
      operationId: OPERATION_ID,
      policyVersion: 'wemp.m02.m4.v1',
      issuedAt: NOW.toISOString(),
      notBefore: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      jwtId: JWT_ID,
      keyId: 'active-1',
    });
    await expect(
      service.verifyBootstrap({
        compact,
        environment: 'development',
        operationId: OPERATION_ID,
        now: NOW,
      }),
    ).resolves.toBe(createHash('sha256').update(compact).digest('base64url'));
  });

  it('denies bootstrap evidence without separation of authorities', async () => {
    const compact = await sign({
      version: 'walrus.bootstrap.v1',
      issuer: 'urn:walrus:bootstrap-control-plane',
      audience: 'urn:walrus:module-01:bootstrap',
      environment: 'development',
      intendedIdentityId: IDENTITY_ID,
      intendedIdentifierReferences: ['identifier:1'],
      requestedClassification: 'SUPER_ADMIN_AUTHENTICATION',
      requestedRole: 'SUPER_ADMIN',
      securityAuthorityId: 'same',
      operationsAuthorityId: 'same',
      operationId: OPERATION_ID,
      policyVersion: 'wemp.m02.m4.v1',
      issuedAt: NOW.toISOString(),
      notBefore: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      jwtId: JWT_ID,
      keyId: 'active-1',
    });
    await expect(
      service.verifyBootstrap({
        compact,
        environment: 'development',
        operationId: OPERATION_ID,
        now: NOW,
      }),
    ).rejects.toMatchObject({ reasonCode: 'BSV1_INVALID' });
  });

  it('reconstructs and verifies the approved RFC 8785 readiness binding', async () => {
    const canonical = canonicalize({
      version: 'walrus.identity-readiness.v1',
      identityId: IDENTITY_ID,
      classification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      environment: 'development',
      request: { type: 'PROVISIONING', id: REQUEST_ID },
      controls: {
        identifierVerified: true,
        credentialReady: true,
        mfaReady: true,
        identityActive: true,
      },
    });
    const compact = await sign({
      version: 'walrus.identity-readiness.v1',
      issuer: 'urn:walrus:module-01:identity-readiness:development',
      audience: 'urn:walrus:orchestrator:privileged-provisioning',
      subject: 'urn:walrus:service:module-01-identity-readiness',
      identityId: IDENTITY_ID,
      requestType: 'PRIVILEGED_PROVISIONING',
      provisioningRequestId: REQUEST_ID,
      identityState: 'ACTIVE',
      identityVerificationState: 'VERIFIED',
      identifierVerificationState: 'VERIFIED',
      credentialReady: true,
      mfaEnrollmentState: 'ACTIVE',
      recoveryCodeSetState: 'ACTIVE',
      aalCapability: 'AAL2_CAPABLE',
      classification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      authenticationControlVersion: 2,
      identityAggregateVersion: 3,
      classificationAggregateVersion: 4,
      issuedAt: NOW.toISOString(),
      notBefore: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      jwtId: JWT_ID,
      nonce: 'a'.repeat(43),
      environment: 'development',
      policyVersion: 'wemp.m02.m4.v1',
      correlationId: OPERATION_ID,
      operationId: OPERATION_ID,
      keyId: 'active-1',
      requestBindingDigest: createHash('sha256').update(canonical).digest('base64url'),
    });
    await expect(
      service.verifyReadiness({
        compact,
        environment: 'development',
        expectedAudience: 'urn:walrus:orchestrator:privileged-provisioning',
        operationId: OPERATION_ID,
        expectedRequestId: REQUEST_ID,
        expectedIdentityId: IDENTITY_ID,
        expectedClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        now: NOW,
      }),
    ).resolves.toMatchObject({ identityId: IDENTITY_ID, requestType: 'PROVISIONING' });
  });

  async function sign(payload: Record<string, unknown>): Promise<string> {
    const { SignJWT } = await loadTrustedJoseModule();
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'active-1' })
      .sign(privateKey);
  }
});

function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(',')}}`;
  throw new Error('unsupported test value');
}
