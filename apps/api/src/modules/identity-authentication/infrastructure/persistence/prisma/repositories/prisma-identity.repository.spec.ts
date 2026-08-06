import { Identity } from '../../../../domain/identity/entities/identity';
import type { IdentityAggregateChangeSet } from '../../../../domain/identity/repositories/identity-repository';
import { OptimisticConcurrencyError } from '../../../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../prisma.service';
import { PrismaIdentityRepository } from './prisma-identity.repository';

const identityId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ab');

function createChangeSet(version: number): IdentityAggregateChangeSet {
  const timestamp = new Date('2026-08-05T00:00:00.000Z');
  return {
    identity: new Identity({
      identityId,
      identityState: 'ACTIVE',
      verificationState: 'PENDING_VERIFICATION',
      aggregateVersion: new AggregateVersion(version),
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    identifiers: [],
    credentials: [],
    classificationAssignments: [],
    mfaEnrollments: [],
    mfaFactors: [],
    recoveryCodeSets: [],
    recoveryCodes: [],
    trustedDevices: [],
    credentialHistoryToAppend: [],
    passwordHistoryToAppend: [],
    stateTransitionsToAppend: [],
  };
}

describe('PrismaIdentityRepository transaction contract', () => {
  it('atomically advances TOTP replay state only through a monotonic conditional update', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { mfaFactor: { updateMany } } as unknown as PrismaService;
    const usedAt = new Date('2026-08-05T00:00:00.000Z');

    await expect(
      new PrismaIdentityRepository(prisma).advanceTotpReplayState(identityId, 59_000_000n, usedAt),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        mfaFactorId: identityId.value,
        factorType: 'TOTP_AUTHENTICATOR',
        factorState: 'ACTIVE',
        OR: [{ lastAcceptedTimeStep: null }, { lastAcceptedTimeStep: { lt: 59_000_000n } }],
      },
      data: {
        lastAcceptedTimeStep: 59_000_000n,
        lastUsedAt: usedAt,
        updatedAt: usedAt,
      },
    });
  });

  it('reports a replay when the monotonic update changes no factor', async () => {
    const prisma = {
      mfaFactor: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaService;
    await expect(
      new PrismaIdentityRepository(prisma).advanceTotpReplayState(identityId, 1n, new Date()),
    ).resolves.toBe(false);
  });

  it('inserts the aggregate root inside a Prisma transaction', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = { identity: { create } };
    const runTransaction = jest.fn(async (operation: (client: unknown) => Promise<void>) =>
      operation(transaction),
    );
    const prisma = {
      $transaction: runTransaction,
    } as unknown as PrismaService;

    await new PrismaIdentityRepository(prisma).insert(createChangeSet(1));

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the expected aggregate version does not match', async () => {
    const transaction = {
      identity: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: unknown) => Promise<void>) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;

    await expect(
      new PrismaIdentityRepository(prisma).save(createChangeSet(2), new AggregateVersion(1)),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
  });

  it('resolves authentication state only through protected identifier lookup digests', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { identityIdentifier: { findFirst } } as unknown as PrismaService;

    const result = await new PrismaIdentityRepository(prisma).findByIdentifierLookups('EMAIL', [
      new ProtectedValue('lookup-v2:digest-two'),
      new ProtectedValue('lookup-v1:digest-one'),
    ]);

    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          identifierType: 'EMAIL',
          lookupDigest: { in: ['lookup-v2:digest-two', 'lookup-v1:digest-one'] },
        },
      }),
    );
    expect(JSON.stringify(findFirst.mock.calls)).not.toContain('person@example.com');
  });
});
