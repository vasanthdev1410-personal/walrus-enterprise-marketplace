/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import type { PrismaService } from '../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SignedBoundaryEvidenceService } from '../../infrastructure/trusted-workload/signed-boundary-evidence.service';
import type { PrivilegedActivationService } from './privileged-activation.service';
import { ReadinessInboxService } from './readiness-inbox.service';

const NOW = new Date('2026-08-12T10:00:00.000Z');
const ID = {
  saga: '0191310f-789a-7123-8123-000000000001',
  operation: '0191310f-789a-7123-8123-000000000002',
  request: '0191310f-789a-7123-8123-000000000003',
  target: '0191310f-789a-7123-8123-000000000004',
  message: '0191310f-789a-7123-8123-000000000005',
  jwt: '0191310f-789a-7123-8123-000000000006',
  generated: '0191310f-789a-7123-8123-000000000007',
  assignment: '0191310f-789a-7123-8123-000000000008',
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fixture(prior: null | Record<string, unknown> = null) {
  const saga = {
    sagaId: ID.saga,
    operationId: ID.operation,
    requestId: ID.request,
    sagaType: 'ADMIN_PROVISIONING',
    targetIdentityId: ID.target,
    requestedRole: 'ADMIN',
    requestedClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
    environment: 'development',
    roleAssignmentId: null as string | null,
  };
  const prisma = {
    privilegedActivationSaga: { findUnique: jest.fn().mockResolvedValue(saga) },
    identityReadinessInbox: {
      findFirst: jest.fn().mockResolvedValue(prior),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const activation = {
    complete: jest.fn().mockResolvedValue(ID.assignment),
  } as unknown as PrivilegedActivationService;
  const evidence = {
    verifyReadiness: jest.fn().mockResolvedValue({
      digest: 'digest',
      verificationReference: 'rdv:digest',
      jwtId: ID.jwt,
      identityId: ID.target,
      operationId: ID.operation,
      requestId: ID.request,
      requestType: 'PROVISIONING',
      classification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      identityVersion: 3,
      controlVersion: 2,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 60_000),
    }),
  } as unknown as SignedBoundaryEvidenceService;
  return {
    service: new ReadinessInboxService(
      prisma,
      activation,
      evidence,
      { now: () => NOW },
      { next: () => new UuidV7(ID.generated) },
    ),
    prisma,
    activation,
    saga,
  };
}

const workload = {
  version: 'walrus.workload.v1' as const,
  issuer: 'issuer',
  audience: 'urn:walrus:module-02:authorization' as const,
  subject: 'urn:walrus:service:module-01-identity-readiness',
  environment: 'development' as const,
  operationId: ID.operation,
  contractVersion: 'wemp.m01-m02.authorization.v2' as const,
  requestDigest: 'request',
  certificateThumbprint: 'thumb',
  issuedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 60_000),
  jwtId: ID.jwt,
  keyId: 'key',
  verificationReference: 'wi:1',
};

describe('ReadinessInboxService', () => {
  it('completes readiness and records the inbox result', async () => {
    const { service, prisma, activation } = fixture();
    await expect(
      service.receive({
        messageId: ID.message,
        sagaId: ID.saga,
        expectedSagaVersion: 1,
        compactAttestation: 'jwt',
        workload,
      }),
    ).resolves.toEqual({ assignmentId: ID.assignment, duplicate: false });
    expect(activation.complete).toHaveBeenCalled();
    expect(prisma.identityReadinessInbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: 'COMPLETED' }) }),
    );
  });

  it('returns an already completed identical delivery without reactivation', async () => {
    const { service, saga, activation } = fixture({
      sagaId: ID.saga,
      attestationDigest: 'digest',
      result: 'COMPLETED',
    });
    saga.roleAssignmentId = ID.assignment;
    await expect(
      service.receive({
        messageId: ID.message,
        sagaId: ID.saga,
        expectedSagaVersion: 2,
        compactAttestation: 'jwt',
        workload,
      }),
    ).resolves.toEqual({ assignmentId: ID.assignment, duplicate: true });
    expect(activation.complete).not.toHaveBeenCalled();
  });

  it('denies a message identifier reused for different evidence', async () => {
    const { service } = fixture({
      sagaId: ID.saga,
      attestationDigest: 'other',
      result: 'COMPLETED',
    });
    await expect(
      service.receive({
        messageId: ID.message,
        sagaId: ID.saga,
        expectedSagaVersion: 1,
        compactAttestation: 'jwt',
        workload,
      }),
    ).rejects.toMatchObject({ reasonCode: 'READINESS_REPLAY_CONFLICT' });
  });

  it('marks a received delivery for reconciliation when atomic activation fails', async () => {
    const { service, activation, prisma } = fixture();
    jest.mocked(activation.complete).mockRejectedValueOnce(new Error('transaction failed'));
    await expect(
      service.receive({
        messageId: ID.message,
        sagaId: ID.saga,
        expectedSagaVersion: 1,
        compactAttestation: 'jwt',
        workload,
      }),
    ).rejects.toThrow('transaction failed');
    expect(prisma.identityReadinessInbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ result: 'RECONCILIATION_REQUIRED' }),
      }),
    );
  });

  it('denies a workload operation that is not bound to the saga', async () => {
    const { service } = fixture();
    await expect(
      service.receive({
        messageId: ID.message,
        sagaId: ID.saga,
        expectedSagaVersion: 1,
        compactAttestation: 'jwt',
        workload: { ...workload, operationId: ID.request },
      }),
    ).rejects.toMatchObject({ reasonCode: 'READINESS_BINDING_MISMATCH' });
  });
});
