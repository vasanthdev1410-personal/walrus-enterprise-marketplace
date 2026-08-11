import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { OptimisticConcurrencyError } from '../../../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { IdentityRoleAssignment } from '../../../../domain/entities/identity-role-assignment';
import { PrismaIdentityRoleAssignmentRepository } from './prisma-identity-role-assignment.repository';

const ASSIGNMENT_ID = new UuidV7('0191310f-789a-7123-8123-000000000001');
const IDENTITY_ID = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ACTOR = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NOW = new Date('2026-08-11T00:00:00.000Z');

function activeAssignment(): IdentityRoleAssignment {
  return new IdentityRoleAssignment({
    assignmentId: ASSIGNMENT_ID,
    identityId: IDENTITY_ID,
    roleName: 'ADMIN',
    assignmentState: 'ACTIVE',
    assignedByIdentityId: ACTOR,
    assignedAt: NOW,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

const persistedRow = {
  assignmentId: ASSIGNMENT_ID.value,
  identityId: IDENTITY_ID.value,
  roleName: 'ADMIN',
  assignmentState: 'ACTIVE',
  assignedByIdentityId: ACTOR.value,
  assignedAt: NOW,
  revokedByIdentityId: null,
  revokedAt: null,
  aggregateVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('PrismaIdentityRoleAssignmentRepository (M02 persistence)', () => {
  it('maps a persisted row back to the domain when reading by identity', async () => {
    const findMany = jest
      .fn<Promise<readonly unknown[]>, [unknown]>()
      .mockResolvedValue([persistedRow]);
    const prisma = {
      identityRoleAssignment: { findMany },
    } as unknown as PrismaService;

    const assignments = await new PrismaIdentityRoleAssignmentRepository(
      prisma,
    ).findActiveByIdentityId(IDENTITY_ID);

    expect(findMany).toHaveBeenCalledWith({
      where: { identityId: IDENTITY_ID.value, assignmentState: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    expect(assignments[0]?.properties).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      roleName: 'ADMIN',
      assignmentState: 'ACTIVE',
    });
  });

  it('returns null when no assignment exists for the id', async () => {
    const prisma = {
      identityRoleAssignment: {
        findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const result = await new PrismaIdentityRoleAssignmentRepository(prisma).findById(ASSIGNMENT_ID);

    expect(result).toBeNull();
  });

  it('persists a new assignment', async () => {
    const create = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const prisma = {
      identityRoleAssignment: { create },
    } as unknown as PrismaService;

    await new PrismaIdentityRoleAssignmentRepository(prisma).insert(activeAssignment());

    expect(create).toHaveBeenCalledTimes(1);
    const calledData = (create.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined)
      ?.data;
    expect(calledData).toMatchObject({
      assignmentId: ASSIGNMENT_ID.value,
      roleName: 'ADMIN',
      aggregateVersion: 1,
    });
  });

  it('saves a versioned state change when the version matches', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const prisma = {
      identityRoleAssignment: { updateMany },
    } as unknown as PrismaService;
    const assignment = new IdentityRoleAssignment({
      assignmentId: ASSIGNMENT_ID,
      identityId: IDENTITY_ID,
      roleName: 'ADMIN',
      assignmentState: 'REVOKED',
      assignedByIdentityId: ACTOR,
      assignedAt: NOW,
      revokedByIdentityId: ACTOR,
      revokedAt: NOW,
      aggregateVersion: new AggregateVersion(2),
      createdAt: NOW,
      updatedAt: NOW,
    });

    await new PrismaIdentityRoleAssignmentRepository(prisma).save(assignment);

    expect(updateMany).toHaveBeenCalledTimes(1);
    const calledArgs = updateMany.mock.calls[0]?.[0] as
      { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
    expect(calledArgs?.where).toMatchObject({
      assignmentId: ASSIGNMENT_ID.value,
      aggregateVersion: 1,
    });
    expect(calledArgs?.data).toMatchObject({ assignmentState: 'REVOKED', aggregateVersion: 2 });
  });

  it('rejects a stale versioned save with OptimisticConcurrencyError', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 0 });
    const prisma = {
      identityRoleAssignment: { updateMany },
    } as unknown as PrismaService;
    const assignment = new IdentityRoleAssignment({
      assignmentId: ASSIGNMENT_ID,
      identityId: IDENTITY_ID,
      roleName: 'ADMIN',
      assignmentState: 'REVOKED',
      assignedByIdentityId: ACTOR,
      assignedAt: NOW,
      revokedByIdentityId: ACTOR,
      revokedAt: NOW,
      aggregateVersion: new AggregateVersion(2),
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      new PrismaIdentityRoleAssignmentRepository(prisma).save(assignment),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
  });
});
