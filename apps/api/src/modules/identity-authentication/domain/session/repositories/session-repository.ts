import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { Session } from '../entities/session';
import type { RefreshTokenFamily } from '../entities/refresh-token-family';
import type { RefreshTokenRecord } from '../entities/refresh-token-record';
import type { RefreshTokenDigest } from '../value-objects/refresh-token-digest';

export interface SessionRepository {
  findById(sessionId: UuidV7): Promise<Session | null>;
  /**
   * M01-SES-001. Returns every persisted Session of an identity (newest
   * activity first); the service filters the approved visible subset. Session
   * state is authoritative, so revoked/expired rows are retained for audit.
   */
  findSessionsByIdentity(identityId: UuidV7): Promise<readonly Session[]>;
  findByRefreshTokenDigest(digest: RefreshTokenDigest): Promise<RefreshTokenSnapshot | null>;
  rotateRefreshToken(rotation: RefreshTokenRotation): Promise<void>;
  revokeRefreshTokenFamilyForReuse(reuse: RefreshTokenReuse): Promise<void>;
  revokeSession(revocation: SessionRevocation): Promise<void>;
  revokeAllSessions(revocation: AllSessionsRevocation): Promise<number>;
  revokeAllSessionsForRecovery(revocation: RecoverySessionsRevocation): Promise<number>;
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

/**
 * Recovery-triggered revocation (M01-CRED-003, future M01-REC-006).
 *
 * Password Reset is an approved revocation trigger but the caller is not an
 * ordinary authenticated identity, so there is no authorizing Session to
 * validate. Every ACTIVE Session and Refresh Token Family of the Identity is
 * revoked; fresh ordinary authentication is required afterwards.
 */
export interface RecoverySessionsRevocation {
  readonly identityId: UuidV7;
  readonly revokedAt: Date;
  readonly revocationReason: string;
}

export interface SessionAggregateChangeSet {
  readonly session: Session;
  readonly tokenFamilies: readonly RefreshTokenFamily[];
  readonly refreshTokens: readonly RefreshTokenRecord[];
}
