/* eslint-disable @typescript-eslint/unbound-method */
import {
  M4AuthorityService,
  type AuthoritySignerPort,
  type IssueProvisioningCommand,
} from './m4-authority.service';
import type { PrismaService } from '../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

const NOW = new Date('2026-08-12T10:00:00.000Z');
const IDS = [
  '0191310f-789a-7123-8123-000000000001',
  '0191310f-789a-7123-8123-000000000002',
  '0191310f-789a-7123-8123-000000000003',
  '0191310f-789a-7123-8123-000000000004',
] as const;

function adminCommand(overrides: Partial<IssueProvisioningCommand> = {}): IssueProvisioningCommand {
  return {
    operationId: IDS[0],
    targetIdentityId: IDS[1],
    requestedRole: 'ADMIN',
    requestedClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
    operation: 'PROVISION',
    environment: 'local',
    policyVersion: 'wemp.m02.m4.v1',
    approvals: [
      {
        authorityType: 'SUPER_ADMIN',
        authorityId: 'sa-1',
        approverIdentityId: IDS[2],
        sessionId: 'session-1',
        assurance: 'AAL2',
        evidenceReference: 'approval:1',
        approvedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
    ],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fixture() {
  const tx = {
    provisioningAuthorityRecord: { create: jest.fn().mockResolvedValue({}) },
    authorizationApprovalRecord: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx)),
    provisioningAuthorityRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    bootstrapControlRecord: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  let index = 0;
  const signer: AuthoritySignerPort = {
    activeKeyId: jest.fn().mockResolvedValue('m4-authority-key-1'),
    signProvisioningClaims: jest.fn().mockResolvedValue('signed-prv1'),
  };
  const service = new M4AuthorityService(
    prisma,
    { now: () => NOW },
    { next: () => new UuidV7(IDS[index++ % IDS.length] ?? IDS[0]) },
    signer,
  );
  return { service, tx, prisma };
}

describe('M4AuthorityService', () => {
  it('issues PRV1 atomically with AAL2 approval evidence', async () => {
    const { service, tx } = fixture();
    const result = await service.issueProvisioning(adminCommand());
    expect(result.lookupReference).toMatch(/^prvref:/);
    expect(result.compactAssertion).toBe('signed-prv1');
    expect(tx.provisioningAuthorityRecord.create.mock.calls).toHaveLength(1);
    expect(tx.authorizationApprovalRecord.create.mock.calls).toHaveLength(1);
  });

  it.each<IssueProvisioningCommand>([
    adminCommand({ requestedClassification: 'SUPER_ADMIN_AUTHENTICATION' }),
    adminCommand({ approvals: [] }),
    adminCommand({
      approvals: [
        {
          authorityType: 'SUPER_ADMIN',
          authorityId: 'sa-1',
          approverIdentityId: IDS[2],
          sessionId: 's',
          assurance: 'AAL2',
          evidenceReference: 'e',
          approvedAt: NOW,
          expiresAt: NOW,
        },
      ],
    }),
    adminCommand({
      approvals: [
        {
          authorityType: 'SUPER_ADMIN',
          authorityId: 'sa-1',
          approverIdentityId: IDS[1],
          sessionId: 's',
          assurance: 'AAL2',
          evidenceReference: 'e',
          approvedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 1_000),
        },
      ],
    }),
  ])('denies invalid Admin issuance quorum %#', async (command) => {
    await expect(fixture().service.issueProvisioning(command)).rejects.toMatchObject({
      reasonCode: 'PROVISIONING_QUORUM_INVALID',
    });
  });

  it('requires two Super Admins and Security for non-initial Super Admin', async () => {
    const base = {
      authorityType: 'SUPER_ADMIN' as const,
      authorityId: 'sa-1',
      approverIdentityId: IDS[2],
      sessionId: 'session-1',
      assurance: 'AAL2' as const,
      evidenceReference: 'approval:1',
      approvedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 60_000),
    };
    const command = adminCommand({
      requestedRole: 'SUPER_ADMIN',
      requestedClassification: 'SUPER_ADMIN_AUTHENTICATION',
      approvals: [
        base,
        { ...base, authorityId: 'sa-2', approverIdentityId: IDS[3] },
        {
          authorityType: 'SECURITY',
          authorityId: 'security-1',
          sessionId: 'security-session',
          assurance: 'AAL2',
          evidenceReference: 'security:1',
          approvedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 60_000),
        },
      ],
    });
    await expect(fixture().service.issueProvisioning(command)).resolves.toMatchObject({
      compactAssertion: 'signed-prv1',
    });
  });

  it('reserves and consumes PRV1 using optimistic compare-and-set', async () => {
    const { service, prisma } = fixture();
    await service.reserveProvisioning({
      lookupReference: 'prvref:value',
      assertion: 'jwt',
      operationId: IDS[0],
      jwtId: IDS[2],
      expectedVersion: 1,
    });
    await service.consumeProvisioning(IDS[0], 2);
    expect(jest.mocked(prisma.provisioningAuthorityRecord.updateMany).mock.calls).toHaveLength(2);
  });

  it('denies stale or replayed PRV1', async () => {
    const { service, prisma } = fixture();
    jest.mocked(prisma.provisioningAuthorityRecord.updateMany).mockResolvedValue({ count: 0 });
    await expect(
      service.reserveProvisioning({
        lookupReference: 'x',
        assertion: 'x',
        operationId: IDS[0],
        jwtId: IDS[2],
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      reasonCode: 'PROVISIONING_EVIDENCE_UNAVAILABLE',
    });
    await expect(service.consumeProvisioning(IDS[0], 2)).rejects.toMatchObject({
      reasonCode: 'PROVISIONING_EVIDENCE_UNAVAILABLE',
    });
  });

  it('opens bootstrap only with distinct authorities and a bounded lifetime', async () => {
    const { service, prisma } = fixture();
    await service.openBootstrap({
      environment: 'local',
      operationId: IDS[0],
      intendedIdentityId: IDS[1],
      jwtId: IDS[2],
      evidenceDigest: 'digest',
      securityAuthorityId: 'security',
      operationsAuthorityId: 'operations',
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 600_000),
    });
    expect(jest.mocked(prisma.bootstrapControlRecord.create).mock.calls).toHaveLength(1);
    await expect(
      service.openBootstrap({
        environment: 'local',
        operationId: IDS[0],
        intendedIdentityId: IDS[1],
        jwtId: IDS[2],
        evidenceDigest: 'digest',
        securityAuthorityId: 'same',
        operationsAuthorityId: 'same',
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 1_000),
      }),
    ).rejects.toMatchObject({ reasonCode: 'BOOTSTRAP_UNAVAILABLE' });
  });
});
