import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { Session } from '../../domain/session/entities/session';
import type { SessionProperties } from '../../domain/session/entities/session';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { SessionVersion } from '../../domain/session/value-objects/session-version';
import { SessionManagementApplicationService } from './session-management-application.service';

const IDENTITY_ID = '0191310f-789a-7123-8123-000000000001';
const SESSION_A = '0191310f-789a-7123-8123-000000000002';
const SESSION_B = '0191310f-789a-7123-8123-000000000003';
const FOREIGN_SESSION = '0191310f-789a-7123-8123-000000000004';
const RECOVERY_SESSION = '0191310f-789a-7123-8123-000000000005';
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

function buildSession(overrides: Partial<SessionProperties> = {}): Session {
  return new Session({
    sessionId: new UuidV7(SESSION_A),
    identityId: new UuidV7(IDENTITY_ID),
    sessionClass: 'INTERACTIVE_WEB',
    sessionState: 'ACTIVE',
    sessionVersion: new SessionVersion(1),
    authenticationAssurance: 'AAL1',
    authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
    authenticationMethods: ['PASSWORD'],
    createdAt: new Date(FIXED_NOW.getTime() - 3_600_000),
    lastActivityAt: FIXED_NOW,
    idleExpiresAt: new Date(FIXED_NOW.getTime() + 15 * 60_000),
    absoluteExpiresAt: new Date(FIXED_NOW.getTime() + 8 * 3_600_000),
    aggregateVersion: new AggregateVersion(1),
    ...overrides,
  });
}

function createFixture(): {
  service: SessionManagementApplicationService;
  sessions: jest.Mocked<SessionRepository>;
} {
  const sessions: jest.Mocked<SessionRepository> = {
    findById: jest.fn(),
    findSessionsByIdentity: jest.fn(),
    findByRefreshTokenDigest: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeRefreshTokenFamilyForReuse: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllSessions: jest.fn(),
    revokeAllSessionsForRecovery: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
  };
  const service = new SessionManagementApplicationService(sessions, {
    now: () => FIXED_NOW,
  });
  return { service, sessions };
}

describe('SessionManagementApplicationService.listSessions (M01-SES-001)', () => {
  it('returns only ACTIVE ordinary sessions of the identity', async () => {
    const { service, sessions } = createFixture();
    sessions.findSessionsByIdentity.mockResolvedValue([
      buildSession({ sessionId: new UuidV7(SESSION_A) }),
      buildSession({
        sessionId: new UuidV7(SESSION_B),
        sessionState: 'REVOKED',
        revokedAt: FIXED_NOW,
      }),
      buildSession({ sessionId: new UuidV7(RECOVERY_SESSION), sessionClass: 'RECOVERY' }),
    ]);

    const result = await service.listSessions({ identityId: new UuidV7(IDENTITY_ID) });

    expect(result).toHaveLength(1);
    expect(result[0]?.properties.sessionId.value).toBe(SESSION_A);
  });

  it('returns an empty list when the identity has no active sessions', async () => {
    const { service, sessions } = createFixture();
    sessions.findSessionsByIdentity.mockResolvedValue([]);

    const result = await service.listSessions({ identityId: new UuidV7(IDENTITY_ID) });

    expect(result).toEqual([]);
  });
});

describe('SessionManagementApplicationService.getSession (M01-SES-002)', () => {
  it('returns one owned session regardless of state', async () => {
    const { service, sessions } = createFixture();
    sessions.findById.mockResolvedValue(
      buildSession({
        sessionId: new UuidV7(SESSION_B),
        sessionState: 'REVOKED',
        revokedAt: FIXED_NOW,
      }),
    );

    const result = await service.getSession({
      identityId: new UuidV7(IDENTITY_ID),
      sessionId: new UuidV7(SESSION_B),
    });

    expect(result.properties.sessionId.value).toBe(SESSION_B);
  });

  it('fails closed with RESOURCE_NOT_AVAILABLE for an unknown session', async () => {
    const { service, sessions } = createFixture();
    sessions.findById.mockResolvedValue(null);

    await expect(
      service.getSession({
        identityId: new UuidV7(IDENTITY_ID),
        sessionId: new UuidV7(SESSION_B),
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
  });

  it('never exposes a session owned by another identity', async () => {
    const { service, sessions } = createFixture();
    sessions.findById.mockResolvedValue(
      buildSession({
        sessionId: new UuidV7(FOREIGN_SESSION),
        identityId: new UuidV7('0191310f-789a-7123-8123-0000000000ff'),
      }),
    );

    await expect(
      service.getSession({
        identityId: new UuidV7(IDENTITY_ID),
        sessionId: new UuidV7(FOREIGN_SESSION),
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
  });

  it('hides recovery-class sessions from ordinary session management', async () => {
    const { service, sessions } = createFixture();
    sessions.findById.mockResolvedValue(
      buildSession({ sessionId: new UuidV7(RECOVERY_SESSION), sessionClass: 'RECOVERY' }),
    );

    await expect(
      service.getSession({
        identityId: new UuidV7(IDENTITY_ID),
        sessionId: new UuidV7(RECOVERY_SESSION),
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
  });
});

describe('SessionManagementApplicationService.revokeSession (M01-SES-003)', () => {
  it('revokes an ACTIVE owned session with the version precondition', async () => {
    const { service, sessions } = createFixture();
    sessions.findById.mockResolvedValue(buildSession({ sessionId: new UuidV7(SESSION_A) }));

    await service.revokeSession({
      identityId: new UuidV7(IDENTITY_ID),
      sessionId: new UuidV7(SESSION_A),
      expectedSessionVersion: 1,
    });

    const revocation = sessions.revokeSession.mock.calls[0]?.[0];
    expect(revocation?.sessionId.value).toBe(SESSION_A);
    expect(revocation?.identityId.value).toBe(IDENTITY_ID);
    expect(revocation?.expectedSessionVersion).toBe(1);
    expect(revocation?.revocationReason).toBe('USER_REVOKED');
    expect(revocation?.revokedAt).toBe(FIXED_NOW);
  });

  it('is idempotent for an already-REVOKED session (never alters security state)', async () => {
    const { service, sessions } = createFixture();
    sessions.findById.mockResolvedValue(
      buildSession({
        sessionId: new UuidV7(SESSION_B),
        sessionState: 'REVOKED',
        revokedAt: FIXED_NOW,
      }),
    );

    await service.revokeSession({
      identityId: new UuidV7(IDENTITY_ID),
      sessionId: new UuidV7(SESSION_B),
      expectedSessionVersion: 2,
    });

    expect(sessions.revokeSession.mock.calls).toHaveLength(0);
  });

  it('fails closed with RESOURCE_NOT_AVAILABLE for an unknown session', async () => {
    const { service, sessions } = createFixture();
    sessions.findById.mockResolvedValue(null);

    await expect(
      service.revokeSession({
        identityId: new UuidV7(IDENTITY_ID),
        sessionId: new UuidV7(SESSION_B),
        expectedSessionVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
    expect(sessions.revokeSession.mock.calls).toHaveLength(0);
  });

  it('fails closed with RESOURCE_NOT_AVAILABLE for a session owned by another identity', async () => {
    const { service, sessions } = createFixture();
    sessions.findById.mockResolvedValue(
      buildSession({
        sessionId: new UuidV7(FOREIGN_SESSION),
        identityId: new UuidV7('0191310f-789a-7123-8123-0000000000ff'),
      }),
    );

    await expect(
      service.revokeSession({
        identityId: new UuidV7(IDENTITY_ID),
        sessionId: new UuidV7(FOREIGN_SESSION),
        expectedSessionVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
  });

  it('maps a concurrent version conflict to RESOURCE_STATE_CONFLICT', async () => {
    const { service, sessions } = createFixture();
    sessions.findById.mockResolvedValue(buildSession({ sessionId: new UuidV7(SESSION_A) }));
    sessions.revokeSession.mockRejectedValue(new OptimisticConcurrencyError('Session logout'));

    await expect(
      service.revokeSession({
        identityId: new UuidV7(IDENTITY_ID),
        sessionId: new UuidV7(SESSION_A),
        expectedSessionVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
  });
});
