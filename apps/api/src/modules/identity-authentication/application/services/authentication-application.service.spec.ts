/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { AuthenticationSecurityClassificationAssignment } from '../../domain/identity/entities/authentication-security-classification-assignment';
import { Credential } from '../../domain/identity/entities/credential';
import { Identity } from '../../domain/identity/entities/identity';
import { MfaFactor } from '../../domain/identity/entities/mfa-factor';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import { RefreshTokenFamily } from '../../domain/session/entities/refresh-token-family';
import { RefreshTokenRecord } from '../../domain/session/entities/refresh-token-record';
import { Session } from '../../domain/session/entities/session';
import type {
  RefreshTokenSnapshot,
  SessionRepository,
} from '../../domain/session/repositories/session-repository';
import { RefreshTokenDigest } from '../../domain/session/value-objects/refresh-token-digest';
import { SessionVersion } from '../../domain/session/value-objects/session-version';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { AuthenticationError } from '../errors/authentication.error';
import type { MfaAuthenticationPort } from '../ports/mfa-authentication.port';
import {
  AuthenticationApplicationService,
  type AuthenticationApplicationPolicy,
} from './authentication-application.service';

const now = new Date('2026-08-05T10:00:00.000Z');
const identityId = uuid(1);
const policy: AuthenticationApplicationPolicy = {
  environment: 'test',
  accessTokenLifetimeSeconds: 600,
  standardRefreshTokenLifetimeSeconds: 2_592_000,
  privilegedRefreshTokenLifetimeSeconds: 28_800,
  sessions: {
    STANDARD_AUTHENTICATION: { idleTimeoutSeconds: 1_800, absoluteTimeoutSeconds: 86_400 },
    PRIVILEGED_ADMIN_AUTHENTICATION: {
      idleTimeoutSeconds: 900,
      absoluteTimeoutSeconds: 28_800,
    },
    SUPER_ADMIN_AUTHENTICATION: { idleTimeoutSeconds: 600, absoluteTimeoutSeconds: 14_400 },
  },
};

describe('AuthenticationApplicationService', () => {
  it('authenticates a standard Identity through protected lookup and persists an AAL1 Session', async () => {
    const fixture = createFixture(snapshot('STANDARD_AUTHENTICATION'));

    const result = await fixture.service.login({
      identifierType: 'EMAIL',
      identifier: ' Person@Example.COM ',
      password: 'correct-password',
      clientType: 'WEB',
    });

    expect(fixture.identifierLookup.createLookupsForResolution).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalValue: 'person@example.com' }),
    );
    expect(result).toMatchObject({
      authenticationOutcome: 'COMPLETED',
      accessToken: 'access-token',
      refreshToken: 'raw-refresh-token',
      authenticationAssurance: 'AAL1',
    });
    expect(fixture.sessionRepository.insert).toHaveBeenCalledTimes(1);
  });

  it('returns only the generic authentication failure for an unresolved Identity', async () => {
    const fixture = createFixture(null);

    await expect(
      fixture.service.login({
        identifierType: 'EMAIL',
        identifier: 'missing@example.com',
        password: 'incorrect',
        clientType: 'WEB',
      }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    expect(fixture.sessionRepository.insert).not.toHaveBeenCalled();
  });

  it('returns a uniform authentication failure for a malformed identifier (no 500)', async () => {
    const fixture = createFixture(snapshot('STANDARD_AUTHENTICATION'));

    await expect(
      fixture.service.login({
        identifierType: 'EMAIL',
        identifier: 'not-an-email',
        password: 'whatever',
        clientType: 'WEB',
      }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    expect(fixture.identifierLookup.createLookupsForResolution).not.toHaveBeenCalled();
    expect(fixture.sessionRepository.insert).not.toHaveBeenCalled();
  });

  it('requires MFA before creating a privileged Session', async () => {
    const fixture = createFixture(snapshot('PRIVILEGED_ADMIN_AUTHENTICATION', true));

    const result = await fixture.service.login({
      identifierType: 'MOBILE',
      identifier: '+919876543210',
      password: 'correct-password',
      clientType: 'MOBILE',
    });

    expect(result).toEqual({
      authenticationOutcome: 'MFA_REQUIRED',
      mfaChallengeId: uuid(90).value,
      challengeVersion: 1,
    });
    expect(fixture.sessionRepository.insert).not.toHaveBeenCalled();
  });

  it('creates an AAL2 Session only after the bound MFA challenge succeeds', async () => {
    const privileged = snapshot('PRIVILEGED_ADMIN_AUTHENTICATION', true);
    const fixture = createFixture(privileged);
    fixture.identityRepository.findAuthenticationById.mockResolvedValue(privileged);

    const result = await fixture.service.completeMfaLogin({
      challengeId: uuid(90),
      evidence: '123456',
      clientType: 'WEB',
    });

    expect(result.authenticationAssurance).toBe('AAL2');
    const insertCall = fixture.sessionRepository.insert.mock.calls[0]?.[0];
    expect(insertCall?.session.properties.authenticationMethods).toEqual([
      'PASSWORD',
      'TOTP_AUTHENTICATOR',
    ]);
  });

  it('rotates an active Refresh Token and never persists the raw successor', async () => {
    const fixture = createFixture(snapshot('STANDARD_AUTHENTICATION'));
    fixture.sessionRepository.findByRefreshTokenDigest.mockResolvedValue(refreshSnapshot('ACTIVE'));

    const result = await fixture.service.refresh('raw-refresh-token');

    expect(result.refreshToken).toBe('raw-refresh-token');
    expect(fixture.sessionRepository.rotateRefreshToken).toHaveBeenCalledTimes(1);
    const rotation = fixture.sessionRepository.rotateRefreshToken.mock.calls[0]?.[0];
    expect(rotation?.successorToken.properties.tokenDigest.value).toBe('hmac:v1:digest');
    expect(JSON.stringify(rotation)).not.toContain('raw-refresh-token');
  });

  it('revokes the family and Session when a used Refresh Token is presented again', async () => {
    const fixture = createFixture(snapshot('STANDARD_AUTHENTICATION'));
    fixture.sessionRepository.findByRefreshTokenDigest.mockResolvedValue(refreshSnapshot('USED'));

    await expect(fixture.service.refresh('raw-refresh-token')).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(fixture.sessionRepository.revokeRefreshTokenFamilyForReuse).toHaveBeenCalledTimes(1);
    expect(fixture.sessionRepository.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('delegates logout and logout-all to atomic Session persistence operations', async () => {
    const fixture = createFixture(snapshot('STANDARD_AUTHENTICATION'));
    fixture.sessionRepository.revokeAllSessions.mockResolvedValue(3);

    await fixture.service.logout(identityId, uuid(30), 2);
    const count = await fixture.service.logoutAll(identityId, uuid(30), 3);

    expect(fixture.sessionRepository.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ expectedSessionVersion: 2, revocationReason: 'LOGOUT' }),
    );
    expect(fixture.sessionRepository.revokeAllSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedAuthorizingSessionVersion: 3,
        revocationReason: 'LOGOUT_ALL',
      }),
    );
    expect(count).toBe(3);
  });
});

interface AuthenticationFixture {
  readonly service: AuthenticationApplicationService;
  readonly identityRepository: jest.Mocked<IdentityRepository>;
  readonly sessionRepository: jest.Mocked<SessionRepository>;
  readonly identifierLookup: {
    readonly createActiveLookup: jest.Mock;
    readonly createLookupsForResolution: jest.Mock;
  };
}

function createFixture(
  authenticationSnapshot: IdentityAuthenticationSnapshot | null,
): AuthenticationFixture {
  let nextIdentifier = 200;
  const identityRepository: jest.Mocked<IdentityRepository> = {
    findPasswordHistory: jest.fn(),
    findById: jest.fn(),
    findAuthenticationById: jest.fn(),
    findByIdentifierLookups: jest.fn().mockResolvedValue(authenticationSnapshot),
    insert: jest.fn(),
    save: jest.fn(),
    advanceTotpReplayState: jest.fn(),
  };
  const sessionRepository: jest.Mocked<SessionRepository> = {
    findById: jest.fn(),
    findByRefreshTokenDigest: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeRefreshTokenFamilyForReuse: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllSessions: jest.fn(),
    revokeAllSessionsForRecovery: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
  };
  const identifierLookup = {
    createActiveLookup: jest.fn().mockReturnValue('lookup:v2:digest'),
    createLookupsForResolution: jest.fn().mockReturnValue(['lookup:v2:digest']),
  };
  const mfa: jest.Mocked<MfaAuthenticationPort> = {
    issueChallenge: jest.fn().mockResolvedValue({ challengeId: uuid(90), version: 1 }),
    verifyChallenge: jest.fn().mockResolvedValue({
      identityId,
      authenticationMethod: 'TOTP_AUTHENTICATOR',
    }),
  };
  const service = new AuthenticationApplicationService(
    identityRepository,
    sessionRepository,
    {
      hash: jest.fn(),
      verify: jest.fn().mockResolvedValue(true),
      verifyForAuthentication: jest
        .fn()
        .mockImplementation((_password: string, encodedHash: string | undefined) =>
          Promise.resolve(encodedHash !== undefined),
        ),
      needsRehash: jest.fn(),
    },
    identifierLookup,
    {
      issue: jest.fn().mockReturnValue({
        rawToken: 'raw-refresh-token',
        digest: 'hmac:v1:digest',
        keyVersion: 'v1',
      }),
      computeDigest: jest.fn().mockReturnValue('hmac:v1:digest'),
      matches: jest.fn().mockReturnValue(true),
    },
    {
      signAccessToken: jest.fn().mockResolvedValue('access-token'),
      verifyAccessToken: jest.fn(),
      getPublicJsonWebKeySet: jest.fn(),
    },
    mfa,
    { now: () => now },
    { next: () => uuid(nextIdentifier++) },
    policy,
  );
  return { service, identityRepository, sessionRepository, identifierLookup };
}

function snapshot(
  classification: 'STANDARD_AUTHENTICATION' | 'PRIVILEGED_ADMIN_AUTHENTICATION',
  withMfa = false,
): IdentityAuthenticationSnapshot {
  return {
    identity: new Identity({
      identityId,
      identityState: 'ACTIVE',
      verificationState: 'VERIFIED',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    }),
    identifiers: [],
    credentials: [
      new Credential({
        credentialId: uuid(2),
        identityId,
        credentialType: 'PASSWORD',
        credentialVersion: 1,
        credentialState: 'ACTIVE',
        protectedSecret: new ProtectedValue('argon2id-hash'),
        createdAt: now,
        updatedAt: now,
      }),
    ],
    classificationAssignments: [
      new AuthenticationSecurityClassificationAssignment({
        classificationAssignmentId: uuid(3),
        identityId,
        classification,
        effectiveAt: now,
        assignmentState: 'EFFECTIVE',
        aggregateVersion: new AggregateVersion(1),
        createdAt: now,
        updatedAt: now,
      }),
    ],
    mfaEnrollments: [],
    mfaFactors: withMfa
      ? [
          new MfaFactor({
            mfaFactorId: uuid(4),
            mfaEnrollmentId: uuid(5),
            factorType: 'TOTP_AUTHENTICATOR',
            factorState: 'ACTIVE',
            encryptedSecretOrReference: new ProtectedValue('encrypted-factor'),
            encryptionKeyVersion: 'v1',
            createdAt: now,
            updatedAt: now,
            verifiedAt: now,
          }),
        ]
      : [],
  };
}

function refreshSnapshot(state: 'ACTIVE' | 'USED'): RefreshTokenSnapshot {
  const session = new Session({
    sessionId: uuid(30),
    identityId,
    sessionClass: 'INTERACTIVE_WEB',
    sessionState: 'ACTIVE',
    sessionVersion: new SessionVersion(1),
    authenticationAssurance: 'AAL1',
    authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
    authenticationMethods: ['PASSWORD'],
    createdAt: now,
    lastActivityAt: now,
    idleExpiresAt: new Date('2026-08-05T10:30:00.000Z'),
    absoluteExpiresAt: new Date('2026-08-06T10:00:00.000Z'),
    aggregateVersion: new AggregateVersion(1),
  });
  const family = new RefreshTokenFamily({
    tokenFamilyId: uuid(31),
    sessionId: session.properties.sessionId,
    familyState: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: now,
  });
  const token = new RefreshTokenRecord({
    refreshTokenId: uuid(32),
    tokenFamilyId: family.properties.tokenFamilyId,
    tokenDigest: new RefreshTokenDigest('hmac:v1:digest'),
    tokenState: state,
    issuedAt: now,
    expiresAt: new Date('2026-09-04T10:00:00.000Z'),
    createdAt: now,
    ...(state === 'USED' ? { consumedAt: now } : {}),
  });
  return { session, family, token };
}

function uuid(value: number): UuidV7 {
  return new UuidV7(`018f22e2-79b0-7cc3-8c5e-${value.toString().padStart(12, '0')}`);
}
