import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import type { Session } from '../../domain/session/entities/session';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { SessionError } from '../errors/session.error';
import type { ClockPort } from '../ports/application-runtime.port';

export interface ListSessionsCommand {
  readonly identityId: UuidV7;
}

export interface GetSessionCommand {
  readonly identityId: UuidV7;
  readonly sessionId: UuidV7;
}

export interface RevokeSessionCommand {
  readonly identityId: UuidV7;
  readonly sessionId: UuidV7;
  /** The session version carried by the If-Match precondition. */
  readonly expectedSessionVersion: number;
}

/**
 * M01-SES-001 to M01-SES-003. Session visibility and revocation for the
 * authenticated identity.
 *
 * Every command is bound to the authenticated identity id established by the
 * server-validated ordinary session (guard), never to a client-selected
 * subject, so an identity can see and manage only its own sessions. Listing
 * exposes only ACTIVE ordinary sessions; viewing returns one owned ordinary
 * session regardless of state (RESOURCE_NOT_AVAILABLE for unknown, foreign or
 * recovery-class sessions); revocation is authoritative, terminal and
 * idempotent — an already REVOKED or EXPIRED session is never altered, the
 * If-Match session version guards the write (RESOURCE_STATE_CONFLICT on a
 * stale version), and the refresh-token family is revoked atomically by the
 * repository. No token material is ever read, stored or exposed.
 */
export class SessionManagementApplicationService {
  public constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: ClockPort,
  ) {}

  public async listSessions(command: ListSessionsCommand): Promise<readonly Session[]> {
    const sessions = await this.sessions.findSessionsByIdentity(command.identityId);
    return Object.freeze(
      sessions.filter(
        (session) =>
          session.properties.sessionState === 'ACTIVE' &&
          session.properties.sessionClass !== 'RECOVERY',
      ),
    );
  }

  public async getSession(command: GetSessionCommand): Promise<Session> {
    const session = await this.sessions.findById(command.sessionId);
    if (session === null) {
      throw new SessionError('RESOURCE_NOT_AVAILABLE');
    }
    // Unknown, foreign and recovery-class sessions are answered uniformly so
    // session state is never enumerable.
    if (
      session.properties.identityId.value !== command.identityId.value ||
      session.properties.sessionClass === 'RECOVERY'
    ) {
      throw new SessionError('RESOURCE_NOT_AVAILABLE');
    }
    return session;
  }

  public async revokeSession(command: RevokeSessionCommand): Promise<void> {
    const session = await this.sessions.findById(command.sessionId);
    if (session === null) {
      throw new SessionError('RESOURCE_NOT_AVAILABLE');
    }
    if (
      session.properties.identityId.value !== command.identityId.value ||
      session.properties.sessionClass === 'RECOVERY'
    ) {
      throw new SessionError('RESOURCE_NOT_AVAILABLE');
    }
    // Idempotent revocation (spec Part 5.4 §18): repeating an authorized
    // revocation for an already REVOKED or EXPIRED session never restores or
    // alters its security state.
    if (session.properties.sessionState !== 'ACTIVE') {
      return;
    }
    try {
      await this.sessions.revokeSession({
        sessionId: command.sessionId,
        identityId: command.identityId,
        expectedSessionVersion: command.expectedSessionVersion,
        revokedAt: this.clock.now(),
        revocationReason: 'USER_REVOKED',
      });
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        // The session was concurrently revoked, rotated or the version
        // precondition is stale: fail closed and force a re-read.
        throw new SessionError('RESOURCE_STATE_CONFLICT');
      }
      throw error;
    }
  }
}
