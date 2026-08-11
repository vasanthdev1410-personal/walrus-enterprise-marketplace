import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { AuthorizationDecisionRecord } from '../../../../domain/entities/authorization-decision-record';
import { IdentityRoleAssignment } from '../../../../domain/entities/identity-role-assignment';
import { PrismaAuthorizationMutationRepository } from './prisma-authorization-mutation.repository';

const ACTOR = new UuidV7('0191310f-789a-7123-8123-000000000001');
const TARGET = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ASSIGNMENT_ID = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NOW = new Date('2026-08-11T00:00:00.000Z');

function assignment(state: 'ACTIVE' | 'REVOKED' = 'ACTIVE'): IdentityRoleAssignment {
  return new IdentityRoleAssignment({
    assignmentId: ASSIGNMENT_ID,
    identityId: TARGET,
    roleName: 'ADMIN',
    assignmentState: state,
    assignedByIdentityId: ACTOR,
    assignedAt: NOW,
    ...(state === 'REVOKED' ? { revokedByIdentityId: ACTOR, revokedAt: NOW } : {}),
    aggregateVersion: new AggregateVersion(state === 'ACTIVE' ? 1 : 2),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function audit(permissionId: string): AuthorizationDecisionRecord {
  return new AuthorizationDecisionRecord({
    authorizationReference: `azr:${permissionId.replaceAll('.', '-')}`,
    actorIdentityId: ACTOR,
    subjectIdentityId: TARGET,
    permissionId,
    decisionOutcome: 'GRANTED',
    decidedAt: NOW,
    createdAt: NOW,
  });
}

describe('PrismaAuthorizationMutationRepository', () => {
  it('persists assignment and mandatory audit in one transaction', async () => {
    const createAssignment = jest.fn().mockResolvedValue(undefined);
    const createAudit = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      identityRoleAssignment: { create: createAssignment },
      authorizationDecisionRecord: { create: createAudit },
    };
    const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
      operation(transaction as never),
    );
    const repository = new PrismaAuthorizationMutationRepository({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    await repository.assignRoleWithAudit(assignment(), audit('authorization.role.assign'));

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(createAssignment).toHaveBeenCalledTimes(1);
    expect(createAudit).toHaveBeenCalledTimes(1);
  });

  it('propagates audit failure from the transaction so the whole mutation rolls back', async () => {
    const auditFailure = new Error('mandatory audit unavailable');
    const transaction = {
      identityRoleAssignment: { create: jest.fn().mockResolvedValue(undefined) },
      authorizationDecisionRecord: { create: jest.fn().mockRejectedValue(auditFailure) },
    };
    const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
      operation(transaction as never),
    );
    const repository = new PrismaAuthorizationMutationRepository({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    await expect(
      repository.assignRoleWithAudit(assignment(), audit('authorization.role.assign')),
    ).rejects.toBe(auditFailure);
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('version-checks revocation and writes actor/target audit in the same transaction', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const createAudit = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
    const transaction = {
      identityRoleAssignment: { updateMany },
      authorizationDecisionRecord: { create: createAudit },
    };
    const repository = new PrismaAuthorizationMutationRepository({
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService);

    await repository.revokeRoleWithAudit(assignment('REVOKED'), audit('authorization.role.revoke'));

    const update = updateMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined;
    expect(update?.where).toMatchObject({ aggregateVersion: 1, assignmentState: 'ACTIVE' });
    const auditCreate = createAudit.mock.calls[0]?.[0] as
      { data?: Record<string, unknown> } | undefined;
    expect(auditCreate?.data).toMatchObject({
      actorIdentityId: ACTOR.value,
      subjectIdentityId: TARGET.value,
    });
  });
});
