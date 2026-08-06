import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { Session } from '../entities/session';
import type { RefreshTokenFamily } from '../entities/refresh-token-family';
import type { RefreshTokenRecord } from '../entities/refresh-token-record';
import type { RefreshTokenDigest } from '../value-objects/refresh-token-digest';

export interface SessionRepository {
  findById(sessionId: UuidV7): Promise<Session | null>;
  findByRefreshTokenDigest(digest: RefreshTokenDigest): Promise<RefreshTokenSnapshot | null>;
  rotateRefreshToken(rotation: RefreshTokenRotation): Promise<void>;
  revokeRefreshTokenFamilyForReuse(reuse: RefreshTokenReuse): Promise<void>;
  revokeSession(revocation: SessionRevocation): Promise<void>;
  revokeAllSessions(revocation: AllSessionsRevocation): Promise<number>;
  insert(changeSet: SessionAggregateChangeSet): Promise<void>;
  save(changeSet: SessionAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
}

export interface RefreshTokenSnapshot {
  readonly session: Session;
  readonly family: RefreshTokenFamily;
  readonly token: RefreshTokenRecord;
}

export interface RefreshTokenRotation {
  readonly presentedTokenId: UuidV7;
  readonly presentedTokenDigest: RefreshTokenDigest;
  readonly successorToken: RefreshTokenRecord;
  readonly consumedAt: Date;
}

export interface RefreshTokenReuse {
  readonly tokenId: UuidV7;
  readonly tokenDigest: RefreshTokenDigest;
  readonly detectedAt: Date;
  readonly revocationReason: string;
}

export interface SessionRevocation {
  readonly sessionId: UuidV7;
  readonly identityId: UuidV7;
  readonly expectedSessionVersion: number;
  readonly revokedAt: Date;
  readonly revocationReason: string;
}

export interface AllSessionsRevocation {
  readonly identityId: UuidV7;
  readonly authorizingSessionId: UuidV7;
  readonly expectedAuthorizingSessionVersion: number;
  readonly revokedAt: Date;
  readonly revocationReason: string;
}

export interface SessionAggregateChangeSet {
  readonly session: Session;
  readonly tokenFamilies: readonly RefreshTokenFamily[];
  readonly refreshTokens: readonly RefreshTokenRecord[];
}
