/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access */
import type { PrismaService } from '../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import {
  PrivilegedActivationService,
  type BeginActivationCommand,
  type CompleteActivationCommand,
} from './privileged-activation.service';

const NOW = new Date('2026-08-12T10:00:00.000Z');
const ID = {
  operation: '0191310f-789a-7123-8123-000000000001',
  request: '0191310f-789a-7123-8123-000000000002',
  target: '0191310f-789a-7123-8123-000000000003',
  saga: '0191310f-789a-7123-8123-000000000004',
  attestation: '0191310f-789a-7123-8123-000000000005',
  jti: '0191310f-789a-7123-8123-000000000006',
  generated: '0191310f-789a-7123-8123-000000000007',
};

function begin(overrides: Partial<BeginActivationCommand> = {}): BeginActivationCommand {
  return {
    operationId: ID.operation,
    requestId: ID.request,
    sagaType: 'ADMIN_PROVISIONING',
    targetIdentityId: ID.target,
    requestedRole: 'ADMIN',
    requestedClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
    environment: 'local',
    authorityReference: 'prvref:approved',
    expiresAt: new Date(NOW.getTime() + 60_000),
    ...overrides,
  };
}

function complete(overrides: Partial<CompleteActivationCommand> = {}): CompleteActivationCommand {
  return {
    sagaId: ID.saga,
    expectedSagaVersion: 1,
    workloadIdentity: 'spiffe://walrus/local/provisioner',
    readiness: {
      attestationId: ID.attestation,
      jwtId: ID.jti,
      attestationDigest: 'digest',
      verificationReference: 'ready:1',
      targetIdentityId: ID.target,
      operationId: ID.operation,
      requestedRole: 'ADMIN',
      effectiveClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      identityVersion: 4,
      readinessControlVersion: 2,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 300_000),
    },
    auditReference: 'azr:activation',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fixture(sagaType = 'ADMIN_PROVISIONING') {
  const saga = {
    sagaId: ID.saga,
    operationId: ID.operation,
    requestId: ID.request,
    sagaType,
    targetIdentityId: ID.target,
    requestedRole: 'ADMIN',
    requestedClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
    environment: 'local',
    sagaState: 'AWAITING_IDENTITY_ACTIVATION',
    authorityReference: 'prvref:approved',
    roleAssignmentId: null,
    expiresAt: new Date(NOW.getTime() + 60_000),
    aggregateVersion: 1,
  };
  const tx = {
    privilegedActivationSaga: {
      findUnique: jest.fn().mockResolvedValue(saga),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    bootstrapControlRecord: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    identityRoleAssignment: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    identityReadinessAttestation: { create: jest.fn().mockResolvedValue({}) },
    authorizationDecisionRecord: { create: jest.fn().mockResolvedValue({}) },
    authorizationApprovalRecord: {
      findMany: jest.fn().mockResolvedValue([
        {
          authorityType: 'SUPER_ADMIN',
          authorityId: 'sa-1',
          assurance: 'AAL2',
          evidenceDigest: 'approval-digest',
          approvedAt: NOW,
        },
      ]),
    },
    authorizationAuditParticipant: { create: jest.fn().mockResolvedValue({}) },
    privilegedAccessEligibilityRecord: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    provisioningAuthorityRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    privilegedAccessEligibilityRecord: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
    },
    privilegedActivationSaga: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;
  const service = new PrivilegedActivationService(
    prisma,
    { now: () => NOW },
    { next: () => new UuidV7(ID.generated) },
  );
  return { service, prisma, tx, saga };
}

describe('PrivilegedActivationService', () => {
  it('opens a durable activation saga and returns an idempotent existing saga', async () => {
    const { service, prisma } = fixture();
    await expect(service.begin(begin())).resolves.toBe(ID.generated);
    expect(jest.mocked(prisma.privilegedActivationSaga.create).mock.calls).toHaveLength(1);
    jest.mocked(prisma.privilegedActivationSaga.findUnique).mockResolvedValue({
      sagaId: ID.saga,
      targetIdentityId: ID.target,
      authorityReference: 'prvref:approved',
    } as never);
    await expect(service.begin(begin())).resolves.toBe(ID.saga);
  });

  it.each([
    begin({ expiresAt: NOW }),
    begin({ requestedClassification: 'SUPER_ADMIN_AUTHENTICATION' }),
  ])('denies invalid activation start %#', async (command) => {
    await expect(fixture().service.begin(command)).rejects.toHaveProperty(
      'name',
      'TrustedBoundaryError',
    );
  });

  it('denies an idempotency collision with a different target', async () => {
    const { service, prisma } = fixture();
    jest.mocked(prisma.privilegedActivationSaga.findUnique).mockResolvedValue({
      sagaId: ID.saga,
      targetIdentityId: ID.operation,
      authorityReference: 'prvref:approved',
    } as never);
    await expect(service.begin(begin())).rejects.toMatchObject({
      reasonCode: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('atomically consumes readiness, creates assignment/audit/eligibility, and completes', async () => {
    const { service, tx } = fixture();
    await expect(service.complete(complete())).resolves.toBe(ID.generated);
    expect(tx.identityReadinessAttestation.create.mock.calls).toHaveLength(1);
    const assignmentCall = tx.identityRoleAssignment.create.mock.calls[0]?.[0] as
      { data?: { assignmentOriginType?: string } } | undefined;
    expect(assignmentCall?.data?.assignmentOriginType).toBe('PRIVILEGED_PROVISIONING');
    expect(tx.authorizationDecisionRecord.create.mock.calls).toHaveLength(1);
    expect(tx.privilegedAccessEligibilityRecord.create.mock.calls).toHaveLength(1);
  });

  it.each([
    { saga: null, reason: 'SAGA_NOT_FOUND' },
    { saga: { aggregateVersion: 2 }, reason: 'STALE_SAGA_VERSION' },
    { saga: { expiresAt: NOW }, reason: 'READINESS_EXPIRED' },
  ])('fails closed for invalid saga state %#', async ({ saga, reason }) => {
    const fixtureValue = fixture();
    jest
      .mocked(fixtureValue.tx.privilegedActivationSaga.findUnique)
      .mockResolvedValue(saga === null ? null : ({ ...fixtureValue.saga, ...saga } as never));
    await expect(fixtureValue.service.complete(complete())).rejects.toMatchObject({
      reasonCode: reason,
    });
  });

  it('permanently closes first bootstrap in the same assignment transaction', async () => {
    const { service, tx, saga } = fixture('FIRST_SUPER_ADMIN_BOOTSTRAP');
    Object.assign(saga, {
      requestedRole: 'SUPER_ADMIN',
      requestedClassification: 'SUPER_ADMIN_AUTHENTICATION',
    });
    tx.bootstrapControlRecord.findUnique.mockResolvedValue({
      permanentlyClosed: false,
      operationId: ID.operation,
      intendedIdentityId: ID.target,
      lifecycleState: 'RESERVED',
    });
    const command = complete({
      readiness: {
        ...complete().readiness,
        requestedRole: 'SUPER_ADMIN',
        effectiveClassification: 'SUPER_ADMIN_AUTHENTICATION',
      },
    });
    await expect(service.complete(command)).resolves.toBe(ID.generated);
    const closeCall = tx.bootstrapControlRecord.updateMany.mock.calls[0]?.[0] as
      { data?: { permanentlyClosed?: boolean; lifecycleState?: string } } | undefined;
    expect(closeCall?.data).toMatchObject({
      permanentlyClosed: true,
      lifecycleState: 'CONSUMED',
    });
  });

  it('denies bootstrap reuse or an existing active Super Admin', async () => {
    const { service, tx, saga } = fixture('FIRST_SUPER_ADMIN_BOOTSTRAP');
    Object.assign(saga, {
      requestedRole: 'SUPER_ADMIN',
      requestedClassification: 'SUPER_ADMIN_AUTHENTICATION',
    });
    tx.bootstrapControlRecord.findUnique.mockResolvedValue({ permanentlyClosed: true });
    const command = complete({
      readiness: {
        ...complete().readiness,
        requestedRole: 'SUPER_ADMIN',
        effectiveClassification: 'SUPER_ADMIN_AUTHENTICATION',
      },
    });
    await expect(service.complete(command)).rejects.toMatchObject({
      reasonCode: 'BOOTSTRAP_UNAVAILABLE',
    });
  });

  it('invalidates eligibility and evaluates only the latest active record', async () => {
    const { service, prisma } = fixture();
    await service.invalidateEligibility(ID.target, 'MFA_CHANGED');
    expect(
      jest.mocked(prisma.privilegedAccessEligibilityRecord.updateMany).mock.calls,
    ).toHaveLength(1);
    jest.mocked(prisma.privilegedAccessEligibilityRecord.findFirst).mockResolvedValue({
      eligibilityState: 'ELIGIBLE',
      invalidatedAt: null,
    } as never);
    await expect(service.isEligible(ID.target, 'ADMIN', 'local')).resolves.toBe(true);
  });

  it('cancels atomically, invalidates eligibility and provisioning evidence', async () => {
    const { service, tx } = fixture();
    await service.cancel(ID.saga, 1, 'OWNER_CANCELLED');
    expect(tx.privilegedActivationSaga.updateMany.mock.calls).toHaveLength(1);
    expect(tx.privilegedAccessEligibilityRecord.updateMany.mock.calls).toHaveLength(1);
    expect(tx.provisioningAuthorityRecord.updateMany.mock.calls).toHaveLength(1);
  });

  it('rejects cancellation of terminal or stale sagas', async () => {
    const terminal = fixture();
    terminal.tx.privilegedActivationSaga.findUnique.mockResolvedValue({
      ...terminal.saga,
      sagaState: 'COMPLETED',
    });
    await expect(terminal.service.cancel(ID.saga, 1, 'x')).rejects.toMatchObject({
      reasonCode: 'SAGA_TERMINAL',
    });
    const stale = fixture();
    stale.tx.privilegedActivationSaga.findUnique.mockResolvedValue(null);
    await expect(stale.service.cancel(ID.saga, 1, 'x')).rejects.toMatchObject({
      reasonCode: 'STALE_SAGA_VERSION',
    });
  });

  it('expires due sagas with optimistic concurrency and fail-closed eligibility', async () => {
    const { service, prisma, saga } = fixture();
    jest
      .mocked(prisma.privilegedActivationSaga.findMany)
      .mockResolvedValue([{ ...saga, expiresAt: new Date(NOW.getTime() - 1) } as never]);
    await expect(service.expireDue()).resolves.toBe(1);
    expect(
      jest.mocked(prisma.privilegedAccessEligibilityRecord.updateMany).mock.calls,
    ).toHaveLength(1);
  });

  it('marks and resumes reconciliation from the correct durable step', async () => {
    const { service, prisma, saga } = fixture();
    await service.markReconciliationRequired(ID.saga, 1, 'REMOTE_FAILURE');
    jest.mocked(prisma.privilegedActivationSaga.findUnique).mockResolvedValue({
      ...saga,
      sagaState: 'FAILED_RECONCILIATION',
      completedSteps: ['ROLE_ASSIGNED'],
    } as never);
    await service.resumeReconciliation(ID.saga, 1, 'RETRY_APPROVED');
    const lastCall = jest.mocked(prisma.privilegedActivationSaga.updateMany).mock.calls.at(-1)?.[0];
    expect(lastCall?.data).toMatchObject({ sagaState: 'ELIGIBILITY_PENDING' });
  });

  it('denies invalid reconciliation attempts', async () => {
    const { service } = fixture();
    await expect(service.resumeReconciliation(ID.saga, 1, ' ')).rejects.toMatchObject({
      reasonCode: 'RECONCILIATION_REASON_REQUIRED',
    });
    await expect(service.resumeReconciliation(ID.saga, 1, 'retry')).rejects.toMatchObject({
      reasonCode: 'RECONCILIATION_UNAVAILABLE',
    });
  });
});
