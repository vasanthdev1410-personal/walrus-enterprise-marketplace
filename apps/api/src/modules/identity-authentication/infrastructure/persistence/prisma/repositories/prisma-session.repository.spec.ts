import { RefreshTokenRecord } from '../../../../domain/session/entities/refresh-token-record';
import { RefreshTokenDigest } from '../../../../domain/session/value-objects/refresh-token-digest';
import { OptimisticConcurrencyError } from '../../../../domain/shared/errors/optimistic-concurrency.error';
import { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../prisma.service';
import { PrismaSessionRepository } from './prisma-session.repository';

const tokenId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000101');
const successorId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000102');
const familyId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000103');
const consumedAt = new Date('2026-08-05T00:10:00.000Z');

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
});
