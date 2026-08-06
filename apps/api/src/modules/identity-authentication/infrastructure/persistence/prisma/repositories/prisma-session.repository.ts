import { Injectable } from '@nestjs/common';
import type { Session } from '../../../../domain/session/entities/session';
import type {
  AllSessionsRevocation,
  RefreshTokenReuse,
  RefreshTokenRotation,
  RefreshTokenSnapshot,
  SessionAggregateChangeSet,
  SessionRevocation,
  SessionRepository,
} from '../../../../domain/session/repositories/session-repository';
import type { RefreshTokenDigest } from '../../../../domain/session/value-objects/refresh-token-digest';
import { OptimisticConcurrencyError } from '../../../../domain/shared/errors/optimistic-concurrency.error';
import type { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import {
  refreshTokenFamilyMapper,
  refreshTokenMapper,
  sessionMapper,
} from '../mappers/session.mapper';
import { PrismaService } from '../prisma.service';
import { assertVersionUpdated, type TransactionClient } from './repository-support';

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(sessionId: UuidV7): Promise<Session | null> {
    const record = await this.prisma.session.findUnique({ where: { sessionId: sessionId.value } });
    return record === null ? null : sessionMapper.toDomain(record);
  }

  public async findByRefreshTokenDigest(
    digest: RefreshTokenDigest,
  ): Promise<RefreshTokenSnapshot | null> {
    const record = await this.prisma.refreshTokenRecord.findUnique({
      where: { tokenDigest: digest.value },
      include: { family: { include: { session: true } } },
    });
    if (record === null) return null;
    return Object.freeze({
      session: sessionMapper.toDomain(record.family.session),
      family: refreshTokenFamilyMapper.toDomain(record.family),
      token: refreshTokenMapper.toDomain(record),
    });
  }

  public async rotateRefreshToken(rotation: RefreshTokenRotation): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        if (
          rotation.successorToken.properties.parentTokenId?.value !==
          rotation.presentedTokenId.value
        ) {
          throw new Error('Refresh Token successor must reference the presented token');
        }
        const consumed = await transaction.refreshTokenRecord.updateMany({
          where: {
            refreshTokenId: rotation.presentedTokenId.value,
            tokenDigest: rotation.presentedTokenDigest.value,
            tokenState: 'ACTIVE',
            expiresAt: { gt: rotation.consumedAt },
            family: {
              is: { familyState: 'ACTIVE', session: { is: { sessionState: 'ACTIVE' } } },
            },
          },
          data: { tokenState: 'USED', consumedAt: rotation.consumedAt },
        });
        assertVersionUpdated(consumed.count, 'Refresh Token rotation');
        await transaction.refreshTokenRecord.create({
          data: refreshTokenMapper.toPersistence(rotation.successorToken),
        });
        const linked = await transaction.refreshTokenRecord.updateMany({
          where: {
            refreshTokenId: rotation.presentedTokenId.value,
            successorTokenId: null,
          },
          data: { successorTokenId: rotation.successorToken.properties.refreshTokenId.value },
        });
        assertVersionUpdated(linked.count, 'Refresh Token successor link');
      },
      { isolationLevel: 'Serializable' },
    );
  }

  public async revokeRefreshTokenFamilyForReuse(reuse: RefreshTokenReuse): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const token = await transaction.refreshTokenRecord.findUnique({
          where: { refreshTokenId: reuse.tokenId.value },
          include: { family: true },
        });
        if (token?.tokenDigest !== reuse.tokenDigest.value) {
          throw new OptimisticConcurrencyError('Refresh Token reuse response');
        }
        const confirmed = token;
        await transaction.refreshTokenRecord.update({
          where: { refreshTokenId: confirmed.refreshTokenId },
          data: { reuseDetectedAt: reuse.detectedAt },
        });
        const family = await transaction.refreshTokenFamily.updateMany({
          where: { tokenFamilyId: confirmed.tokenFamilyId, familyState: 'ACTIVE' },
          data: {
            familyState: 'REVOKED',
            revokedAt: reuse.detectedAt,
            reuseDetectedAt: reuse.detectedAt,
            revocationReason: reuse.revocationReason,
            aggregateVersion: { increment: 1 },
          },
        });
        assertVersionUpdated(family.count, 'Refresh Token Family reuse revocation');
        const session = await transaction.session.updateMany({
          where: { sessionId: confirmed.family.sessionId, sessionState: 'ACTIVE' },
          data: {
            sessionState: 'REVOKED',
            revokedAt: reuse.detectedAt,
            revocationReason: reuse.revocationReason,
            sessionVersion: { increment: 1 },
            aggregateVersion: { increment: 1 },
          },
        });
        assertVersionUpdated(session.count, 'Session reuse revocation');
      },
      { isolationLevel: 'Serializable' },
    );
  }

  public async revokeSession(revocation: SessionRevocation): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const session = await transaction.session.updateMany({
          where: {
            sessionId: revocation.sessionId.value,
            identityId: revocation.identityId.value,
            sessionState: 'ACTIVE',
            sessionVersion: revocation.expectedSessionVersion,
          },
          data: {
            sessionState: 'REVOKED',
            sessionVersion: { increment: 1 },
            aggregateVersion: { increment: 1 },
            revokedAt: revocation.revokedAt,
            revocationReason: revocation.revocationReason,
          },
        });
        assertVersionUpdated(session.count, 'Session logout');
        await transaction.refreshTokenFamily.updateMany({
          where: { sessionId: revocation.sessionId.value, familyState: 'ACTIVE' },
          data: {
            familyState: 'REVOKED',
            aggregateVersion: { increment: 1 },
            revokedAt: revocation.revokedAt,
            revocationReason: revocation.revocationReason,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  public async revokeAllSessions(revocation: AllSessionsRevocation): Promise<number> {
    return this.prisma.$transaction(
      async (transaction) => {
        const authorizingSession = await transaction.session.findFirst({
          where: {
            sessionId: revocation.authorizingSessionId.value,
            identityId: revocation.identityId.value,
            sessionState: 'ACTIVE',
            sessionVersion: revocation.expectedAuthorizingSessionVersion,
          },
          select: { sessionId: true },
        });
        if (authorizingSession === null) {
          throw new OptimisticConcurrencyError('Authorizing Session logout-all');
        }
        const activeSessions = await transaction.session.findMany({
          where: { identityId: revocation.identityId.value, sessionState: 'ACTIVE' },
          select: { sessionId: true },
        });
        const sessionIds = activeSessions.map((session) => session.sessionId);
        if (sessionIds.length === 0) return 0;
        await transaction.refreshTokenFamily.updateMany({
          where: { sessionId: { in: sessionIds }, familyState: 'ACTIVE' },
          data: {
            familyState: 'REVOKED',
            aggregateVersion: { increment: 1 },
            revokedAt: revocation.revokedAt,
            revocationReason: revocation.revocationReason,
          },
        });
        const result = await transaction.session.updateMany({
          where: { sessionId: { in: sessionIds }, sessionState: 'ACTIVE' },
          data: {
            sessionState: 'REVOKED',
            sessionVersion: { increment: 1 },
            aggregateVersion: { increment: 1 },
            revokedAt: revocation.revokedAt,
            revocationReason: revocation.revocationReason,
          },
        });
        return result.count;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  public async insert(changeSet: SessionAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.session.create({ data: sessionMapper.toPersistence(changeSet.session) });
      await this.persistOwnedRecords(transaction, changeSet, false);
    });
  }

  public async save(
    changeSet: SessionAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.session.updateMany({
        where: {
          sessionId: changeSet.session.properties.sessionId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: sessionMapper.toPersistence(changeSet.session),
      });
      assertVersionUpdated(result.count, 'Session');
      await this.persistOwnedRecords(transaction, changeSet, true);
    });
  }

  private async persistOwnedRecords(
    transaction: TransactionClient,
    changeSet: SessionAggregateChangeSet,
    upsert: boolean,
  ): Promise<void> {
    for (const entity of changeSet.tokenFamilies) {
      const data = refreshTokenFamilyMapper.toPersistence(entity);
      if (upsert)
        await transaction.refreshTokenFamily.upsert({
          where: { tokenFamilyId: entity.properties.tokenFamilyId.value },
          create: data,
          update: data,
        });
      else await transaction.refreshTokenFamily.create({ data });
    }
    for (const entity of changeSet.refreshTokens) {
      const data = refreshTokenMapper.toPersistence(entity);
      if (upsert)
        await transaction.refreshTokenRecord.upsert({
          where: { refreshTokenId: entity.properties.refreshTokenId.value },
          create: data,
          update: data,
        });
      else await transaction.refreshTokenRecord.create({ data });
    }
  }
}
