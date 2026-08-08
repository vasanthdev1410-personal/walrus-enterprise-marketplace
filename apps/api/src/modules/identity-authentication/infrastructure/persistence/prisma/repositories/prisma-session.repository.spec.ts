import { RefreshTokenFamily } from '../../../../domain/session/entities/refresh-token-family';
import { RefreshTokenRecord } from '../../../../domain/session/entities/refresh-token-record';
import { Session } from '../../../../domain/session/entities/session';
import { RefreshTokenDigest } from '../../../../domain/session/value-objects/refresh-token-digest';
import { SessionVersion } from '../../../../domain/session/value-objects/session-version';
import { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import { OptimisticConcurrencyError } from '../../../../domain/shared/errors/optimistic-concurrency.error';
import { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../prisma.service';
import { PrismaSessionRepository } from './prisma-session.repository';

const tokenId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000101');
const successorId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000102');
const familyId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000103');
const sessionId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000104');
const identityId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000105');
const consumedAt = new Date('2026-08-05T00:10:00.000Z');
const revokedAt = new Date('2026-08-05T00:20:00.000Z');

function successor(): RefreshTokenRecord {
  return new RefreshTokenRecord({
    refreshTokenId: successorId,
    tokenFamilyId: familyId,
    tokenDigest: new RefreshTokenDigest('refresh-v2:successor-digest'),
    tokenState: 'ACTIVE',
    issuedAt: consumedAt,
    expiresAt: new Date('2026-09-04T00:10:00.000Z'),
    createdAt: consumedAt,
    parentTokenId: tokenId,
  });
}

describe('PrismaSessionRepository atomic Refresh Token persistence', () => {
  it('marks the presented token used, creates one successor and links it atomically', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = { refreshTokenRecord: { updateMany, create } };
    const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
      operation(transaction as never),
    );
    const prisma = { $transaction: runTransaction } as unknown as PrismaService;

    await new PrismaSessionRepository(prisma).rotateRefreshToken({
      presentedTokenId: tokenId,
      presentedTokenDigest: new RefreshTokenDigest('refresh-v1:presented-digest'),
      successorToken: successor(),
      consumedAt,
    });

    expect(runTransaction).toHaveBeenCalledTimes(1);
    const consumeCall: unknown = updateMany.mock.calls[0]?.[0];
    expect(consumeCall).toMatchObject({
      where: { tokenState: 'ACTIVE' },
      data: { tokenState: 'USED', consumedAt },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const linkCall: unknown = updateMany.mock.calls[1]?.[0];
    expect(linkCall).toMatchObject({ data: { successorTokenId: successorId.value } });
  });

  it('fails closed without creating a successor when token consumption loses concurrency', async () => {
    const create = jest.fn();
    const transaction = {
      refreshTokenRecord: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), create },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService;

    await expect(
      new PrismaSessionRepository(prisma).rotateRefreshToken({
        presentedTokenId: tokenId,
        presentedTokenDigest: new RefreshTokenDigest('refresh-v1:presented-digest'),
        successorToken: successor(),
        consumedAt,
      }),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
    expect(create).not.toHaveBeenCalled();
  });

  it('atomically records reuse and revokes the token family and Session', async () => {
    const familyUpdateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const sessionUpdateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const transaction = {
      refreshTokenRecord: {
        findUnique: jest.fn().mockResolvedValue({
          refreshTokenId: tokenId.value,
          tokenFamilyId: familyId.value,
          tokenDigest: 'refresh-v1:presented-digest',
          family: { sessionId: '018f22e2-79b0-7cc3-8c5e-000000000104' },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      refreshTokenFamily: { updateMany: familyUpdateMany },
      session: { updateMany: sessionUpdateMany },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService;

    await new PrismaSessionRepository(prisma).revokeRefreshTokenFamilyForReuse({
      tokenId,
      tokenDigest: new RefreshTokenDigest('refresh-v1:presented-digest'),
      detectedAt: consumedAt,
      revocationReason: 'REFRESH_TOKEN_REUSE',
    });

    const familyCall: unknown = familyUpdateMany.mock.calls[0]?.[0];
    expect(familyCall).toMatchObject({ data: { familyState: 'REVOKED' } });
    const sessionCall: unknown = sessionUpdateMany.mock.calls[0]?.[0];
    expect(sessionCall).toMatchObject({
      data: { sessionState: 'REVOKED', sessionVersion: { increment: 1 } },
    });
  });

  it('loads a Session by id and returns null when absent', async () => {
    const sessionRecord = {
      sessionId: sessionId.value,
      identityId: identityId.value,
      sessionClass: 'INTERACTIVE_WEB',
      sessionState: 'ACTIVE',
      sessionVersion: 1,
      authenticationAssurance: 'AAL1',
      authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
      authenticationMethods: ['PASSWORD'],
      createdAt: consumedAt,
      lastActivityAt: consumedAt,
      idleExpiresAt: consumedAt,
      absoluteExpiresAt: revokedAt,
      aggregateVersion: 1,
      revokedAt: null,
      revocationReason: null,
      deviceSessionId: null,
      mfaVerifiedAt: null,
      correlationId: null,
    };
    const found = { findUnique: jest.fn().mockResolvedValue(sessionRecord) };
    const foundPrisma = { session: found } as unknown as PrismaService;
    expect(
      (await new PrismaSessionRepository(foundPrisma).findById(sessionId))?.properties.sessionId
        .value,
    ).toBe(sessionId.value);

    const missing = { findUnique: jest.fn().mockResolvedValue(null) };
    await expect(
      new PrismaSessionRepository({ session: missing } as unknown as PrismaService).findById(
        sessionId,
      ),
    ).resolves.toBeNull();
  });

  it('loads a Refresh Token snapshot with its family and Session and returns null when absent', async () => {
    const tokenRecord = {
      refreshTokenId: tokenId.value,
      tokenFamilyId: familyId.value,
      tokenDigest: 'refresh-v1:presented-digest',
      tokenState: 'ACTIVE',
      issuedAt: consumedAt,
      expiresAt: revokedAt,
      createdAt: consumedAt,
      consumedAt: null,
      revokedAt: null,
      successorTokenId: null,
      parentTokenId: null,
      reuseDetectedAt: null,
      family: {
        tokenFamilyId: familyId.value,
        sessionId: sessionId.value,
        familyState: 'ACTIVE',
        aggregateVersion: 1,
        createdAt: consumedAt,
        revokedAt: null,
        revocationReason: null,
        reuseDetectedAt: null,
        session: {
          sessionId: sessionId.value,
          identityId: identityId.value,
          sessionClass: 'INTERACTIVE_WEB',
          sessionState: 'ACTIVE',
          sessionVersion: 1,
          authenticationAssurance: 'AAL1',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD'],
          createdAt: consumedAt,
          lastActivityAt: consumedAt,
          idleExpiresAt: consumedAt,
          absoluteExpiresAt: revokedAt,
          aggregateVersion: 1,
          revokedAt: null,
          revocationReason: null,
          deviceSessionId: null,
          mfaVerifiedAt: null,
          correlationId: null,
        },
      },
    };
    const found = { findUnique: jest.fn().mockResolvedValue(tokenRecord) };
    const snapshot = await new PrismaSessionRepository({
      refreshTokenRecord: found,
    } as unknown as PrismaService).findByRefreshTokenDigest(
      new RefreshTokenDigest('refresh-v1:presented-digest'),
    );
    expect(snapshot?.token.properties.tokenDigest.value).toBe('refresh-v1:presented-digest');

    const missing = { findUnique: jest.fn().mockResolvedValue(null) };
    await expect(
      new PrismaSessionRepository({
        refreshTokenRecord: missing,
      } as unknown as PrismaService).findByRefreshTokenDigest(new RefreshTokenDigest('x')),
    ).resolves.toBeNull();
  });

  it('rejects a rotation whose successor does not reference the presented token', async () => {
    const prisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation({} as never),
      ),
    } as unknown as PrismaService;

    await expect(
      new PrismaSessionRepository(prisma).rotateRefreshToken({
        presentedTokenId: familyId,
        presentedTokenDigest: new RefreshTokenDigest('refresh-v1:presented-digest'),
        successorToken: successor(),
        consumedAt,
      }),
    ).rejects.toThrow('Refresh Token successor must reference the presented token');
  });

  it('fails closed when the successor link update loses concurrency', async () => {
    const transaction = {
      refreshTokenRecord: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService;

    await expect(
      new PrismaSessionRepository(prisma).rotateRefreshToken({
        presentedTokenId: tokenId,
        presentedTokenDigest: new RefreshTokenDigest('refresh-v1:presented-digest'),
        successorToken: successor(),
        consumedAt,
      }),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
  });

  it('revokes a Session and its token family', async () => {
    const sessionUpdateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const familyUpdateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const transaction = {
      session: { updateMany: sessionUpdateMany },
      refreshTokenFamily: { updateMany: familyUpdateMany },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService;

    await new PrismaSessionRepository(prisma).revokeSession({
      sessionId,
      identityId,
      expectedSessionVersion: 1,
      revokedAt,
      revocationReason: 'LOGOUT',
    });
    expect(sessionUpdateMany).toHaveBeenCalledTimes(1);
    expect(familyUpdateMany).toHaveBeenCalledTimes(1);

    const losing = {
      session: {
        updateMany: jest
          .fn<Promise<{ count: number }>, [unknown]>()
          .mockResolvedValue({ count: 0 }),
      },
      refreshTokenFamily: { updateMany: jest.fn() },
    };
    await expect(
      new PrismaSessionRepository({
        $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
          operation(losing as never),
        ),
      } as unknown as PrismaService).revokeSession({
        sessionId,
        identityId,
        expectedSessionVersion: 1,
        revokedAt,
        revocationReason: 'LOGOUT',
      }),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
  });

  it('revokes all active Sessions and returns the revoked count', async () => {
    const sessionFindFirst = jest.fn().mockResolvedValue({ sessionId: sessionId.value });
    const sessionFindMany = jest.fn().mockResolvedValue([{ sessionId: sessionId.value }]);
    const sessionUpdateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const familyUpdateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const transaction = {
      session: {
        findFirst: sessionFindFirst,
        findMany: sessionFindMany,
        updateMany: sessionUpdateMany,
      },
      refreshTokenFamily: { updateMany: familyUpdateMany },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService;

    await expect(
      new PrismaSessionRepository(prisma).revokeAllSessions({
        authorizingSessionId: sessionId,
        identityId,
        expectedAuthorizingSessionVersion: 1,
        revokedAt,
        revocationReason: 'LOGOUT_ALL',
      }),
    ).resolves.toBe(1);
  });

  it('fails closed for logout-all when the authorizing Session is stale', async () => {
    const transaction = {
      session: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      refreshTokenFamily: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService;

    await expect(
      new PrismaSessionRepository(prisma).revokeAllSessions({
        authorizingSessionId: sessionId,
        identityId,
        expectedAuthorizingSessionVersion: 2,
        revokedAt,
        revocationReason: 'LOGOUT_ALL',
      }),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
  });

  it('returns zero when there are no other active Sessions to revoke', async () => {
    const transaction = {
      session: {
        findFirst: jest.fn().mockResolvedValue({ sessionId: sessionId.value }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      refreshTokenFamily: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService;

    await expect(
      new PrismaSessionRepository(prisma).revokeAllSessions({
        authorizingSessionId: sessionId,
        identityId,
        expectedAuthorizingSessionVersion: 1,
        revokedAt,
        revocationReason: 'LOGOUT_ALL',
      }),
    ).resolves.toBe(0);
  });

  it('inserts and saves a Session aggregate with its owned token records', async () => {
    const sessionEntity = new Session({
      sessionId,
      identityId,
      sessionClass: 'INTERACTIVE_WEB',
      sessionState: 'ACTIVE',
      sessionVersion: new SessionVersion(1),
      authenticationAssurance: 'AAL1',
      authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
      authenticationMethods: ['PASSWORD'],
      createdAt: consumedAt,
      lastActivityAt: consumedAt,
      idleExpiresAt: consumedAt,
      absoluteExpiresAt: revokedAt,
      aggregateVersion: new AggregateVersion(1),
    });
    const familyEntity = new RefreshTokenFamily({
      tokenFamilyId: familyId,
      sessionId,
      familyState: 'ACTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt: consumedAt,
    });
    const changeSet = {
      session: sessionEntity,
      tokenFamilies: [familyEntity],
      refreshTokens: [successor()],
    };

    const insertTransaction = {
      session: { create: jest.fn().mockResolvedValue(undefined) },
      refreshTokenFamily: { create: jest.fn().mockResolvedValue(undefined) },
      refreshTokenRecord: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const insertPrisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(insertTransaction as never),
      ),
    } as unknown as PrismaService;
    await new PrismaSessionRepository(insertPrisma).insert(changeSet);
    expect(insertTransaction.refreshTokenFamily.create).toHaveBeenCalledTimes(1);
    expect(insertTransaction.refreshTokenRecord.create).toHaveBeenCalledTimes(1);

    const saveTransaction = {
      session: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      refreshTokenFamily: { upsert: jest.fn().mockResolvedValue(undefined) },
      refreshTokenRecord: { upsert: jest.fn().mockResolvedValue(undefined) },
    };
    const savePrisma = {
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(saveTransaction as never),
      ),
    } as unknown as PrismaService;
    await new PrismaSessionRepository(savePrisma).save(changeSet, new AggregateVersion(1));
    expect(saveTransaction.refreshTokenFamily.upsert).toHaveBeenCalledTimes(1);
    expect(saveTransaction.refreshTokenRecord.upsert).toHaveBeenCalledTimes(1);

    const losing = {
      session: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      refreshTokenFamily: { upsert: jest.fn() },
      refreshTokenRecord: { upsert: jest.fn() },
    };
    await expect(
      new PrismaSessionRepository({
        $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
          operation(losing as never),
        ),
      } as unknown as PrismaService).save(changeSet, new AggregateVersion(1)),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
  });
});
