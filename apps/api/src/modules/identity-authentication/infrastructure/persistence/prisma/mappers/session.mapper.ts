import type {
  Prisma,
  RefreshTokenFamily as RefreshTokenFamilyRecord,
  RefreshTokenRecord as RefreshTokenPersistenceRecord,
  Session as SessionRecord,
} from '../../../../../../generated/prisma/client';
import { RefreshTokenFamily } from '../../../../domain/session/entities/refresh-token-family';
import { RefreshTokenRecord } from '../../../../domain/session/entities/refresh-token-record';
import { Session } from '../../../../domain/session/entities/session';
import { RefreshTokenDigest } from '../../../../domain/session/value-objects/refresh-token-digest';
import { SessionVersion } from '../../../../domain/session/value-objects/session-version';
import { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import { compactProperties } from './compact-properties';

export const sessionMapper = {
  toDomain(record: SessionRecord): Session {
    return new Session(
      compactProperties({
        sessionId: new UuidV7(record.sessionId),
        identityId: new UuidV7(record.identityId),
        sessionClass: record.sessionClass,
        sessionState: record.sessionState,
        sessionVersion: new SessionVersion(record.sessionVersion),
        authenticationAssurance: record.authenticationAssurance,
        authenticationSecurityClassificationReference:
          record.authenticationSecurityClassificationReference,
        authenticationMethods: record.authenticationMethods,
        createdAt: record.createdAt,
        lastActivityAt: record.lastActivityAt,
        idleExpiresAt: record.idleExpiresAt,
        absoluteExpiresAt: record.absoluteExpiresAt,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        revokedAt: record.revokedAt ?? undefined,
        revocationReason: record.revocationReason ?? undefined,
        deviceSessionId:
          record.deviceSessionId === null ? undefined : new UuidV7(record.deviceSessionId),
        mfaVerifiedAt: record.mfaVerifiedAt ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(entity: Session): Prisma.SessionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      sessionId: value.sessionId.value,
      identityId: value.identityId.value,
      sessionClass: value.sessionClass,
      sessionState: value.sessionState,
      sessionVersion: value.sessionVersion.value,
      authenticationAssurance: value.authenticationAssurance,
      authenticationSecurityClassificationReference:
        value.authenticationSecurityClassificationReference,
      authenticationMethods: [...value.authenticationMethods],
      createdAt: value.createdAt,
      lastActivityAt: value.lastActivityAt,
      idleExpiresAt: value.idleExpiresAt,
      absoluteExpiresAt: value.absoluteExpiresAt,
      aggregateVersion: value.aggregateVersion.value,
      revokedAt: value.revokedAt,
      revocationReason: value.revocationReason,
      deviceSessionId: value.deviceSessionId?.value,
      mfaVerifiedAt: value.mfaVerifiedAt,
      correlationId: value.correlationId?.value,
    });
  },
};

export const refreshTokenFamilyMapper = {
  toDomain(record: RefreshTokenFamilyRecord): RefreshTokenFamily {
    return new RefreshTokenFamily(
      compactProperties({
        tokenFamilyId: new UuidV7(record.tokenFamilyId),
        sessionId: new UuidV7(record.sessionId),
        familyState: record.familyState,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        revokedAt: record.revokedAt ?? undefined,
        revocationReason: record.revocationReason ?? undefined,
        reuseDetectedAt: record.reuseDetectedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: RefreshTokenFamily): Prisma.RefreshTokenFamilyUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      tokenFamilyId: value.tokenFamilyId.value,
      sessionId: value.sessionId.value,
      familyState: value.familyState,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      revokedAt: value.revokedAt,
      revocationReason: value.revocationReason,
      reuseDetectedAt: value.reuseDetectedAt,
    });
  },
};

export const refreshTokenMapper = {
  toDomain(record: RefreshTokenPersistenceRecord): RefreshTokenRecord {
    return new RefreshTokenRecord(
      compactProperties({
        refreshTokenId: new UuidV7(record.refreshTokenId),
        tokenFamilyId: new UuidV7(record.tokenFamilyId),
        tokenDigest: new RefreshTokenDigest(record.tokenDigest),
        tokenState: record.tokenState,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        consumedAt: record.consumedAt ?? undefined,
        revokedAt: record.revokedAt ?? undefined,
        successorTokenId:
          record.successorTokenId === null ? undefined : new UuidV7(record.successorTokenId),
        parentTokenId: record.parentTokenId === null ? undefined : new UuidV7(record.parentTokenId),
        reuseDetectedAt: record.reuseDetectedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: RefreshTokenRecord): Prisma.RefreshTokenRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      refreshTokenId: value.refreshTokenId.value,
      tokenFamilyId: value.tokenFamilyId.value,
      tokenDigest: value.tokenDigest.value,
      tokenState: value.tokenState,
      issuedAt: value.issuedAt,
      expiresAt: value.expiresAt,
      createdAt: value.createdAt,
      consumedAt: value.consumedAt,
      revokedAt: value.revokedAt,
      successorTokenId: value.successorTokenId?.value,
      parentTokenId: value.parentTokenId?.value,
      reuseDetectedAt: value.reuseDetectedAt,
    });
  },
};
