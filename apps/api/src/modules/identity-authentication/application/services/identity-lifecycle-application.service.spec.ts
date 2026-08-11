import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { Identity } from '../../domain/identity/entities/identity';
import { AuthenticationSecurityClassificationAssignment } from '../../domain/identity/entities/authentication-security-classification-assignment';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import type { IdentityStateChangeAuthorizationPort } from '../ports/identity-state-change-authorization.port';
import { IdentityLifecycleApplicationService } from './identity-lifecycle-application.service';

const IDENTITY_ID = '0191310f-789a-7123-8123-000000000001';
const ACTOR_ID = '0191310f-789a-7123-8123-000000000002';
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

function buildSnapshot(
  overrides: Partial<IdentityAuthenticationSnapshot> = {},
): IdentityAuthenticationSnapshot {
  return {
    identity: new Identity({
      identityId: new UuidV7(IDENTITY_ID),
      identityState: 'ACTIVE',
      verificationState: 'VERIFIED',
      aggregateVersion: new AggregateVersion(3),
      createdAt: new Date(FIXED_NOW.getTime() - 24 * 3_600_000),
      updatedAt: FIXED_NOW,
    }),
    identifiers: [],
    credentials: [],
    classificationAssignments: [],
    mfaEnrollments: [],
    mfaFactors: [],
    trustedDevices: [],
    ...overrides,
  };
}

function createFixture(
  decision: {
    readonly authorized: boolean;
    readonly authorizationReference?: string;
  } = { authorized: true },
): {
  service: IdentityLifecycleApplicationService;
  identities: jest.Mocked<IdentityRepository>;
  sessions: jest.Mocked<SessionRepository>;
  authorization: jest.Mocked<IdentityStateChangeAuthorizationPort>;
} {
  const identities: jest.Mocked<IdentityRepository> = {
    findById: jest.fn(),
    findAuthenticationById: jest.fn(),
    findByIdentifierLookups: jest.fn(),
    findPasswordHistory: jest.fn(),
    findRecoveryCodeSets: jest.fn().mockResolvedValue(null),
    insert: jest.fn(),
    save: jest.fn(),
    advanceTotpReplayState: jest.fn(),
  };
  const sessions: jest.Mocked<SessionRepository> = {
    findById: jest.fn(),
    findSessionsByIdentity: jest.fn(),
    findByRefreshTokenDigest: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeRefreshTokenFamilyForReuse: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllSessions: jest.fn(),
    revokeAllSessionsForRecovery: jest.fn().mockResolvedValue(0),
    insert: jest.fn(),
    save: jest.fn(),
  };
  const authorization: jest.Mocked<IdentityStateChangeAuthorizationPort> = {
    authorizeStateChange: jest.fn().mockResolvedValue(decision),
  };
  const service = new IdentityLifecycleApplicationService(
    identities,
    sessions,
    authorization,
    { now: () => FIXED_NOW },
    { next: () => new UuidV7('0191310f-789a-7123-8123-0000000000aa') },
  );
  return { service, identities, sessions, authorization };
}

describe('IdentityLifecycleApplicationService.readAuthenticationState (M01-ID-001)', () => {
  it('returns approved authentication-state fields only', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot({
        classificationAssignments: [
          new AuthenticationSecurityClassificationAssignment({
            classificationAssignmentId: new UuidV7('0191310f-789a-7123-8123-0000000000b1'),
            identityId: new UuidV7(IDENTITY_ID),
            classification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
            effectiveAt: FIXED_NOW,
            assignmentState: 'EFFECTIVE',
            aggregateVersion: new AggregateVersion(1),
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
          }),
        ],
        mfaEnrollments: [
          {
            properties: {
              enrollmentState: 'ACTIVE',
            },
          } as never,
        ],
      }),
    );

    const result = await service.readAuthenticationState({
      identityId: new UuidV7(IDENTITY_ID),
    });

    expect(result).toEqual({
      identityId: IDENTITY_ID,
      identityState: 'ACTIVE',
      verificationState: 'VERIFIED',
      authenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      mfaState: 'ACTIVE',
      deletionState: 'NONE',
      version: 3,
    });
  });

  it('defaults classification to STANDARD_AUTHENTICATION and derives NOT_ENROLLED MFA', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    const result = await service.readAuthenticationState({
      identityId: new UuidV7(IDENTITY_ID),
    });

    expect(result.authenticationSecurityClassification).toBe('STANDARD_AUTHENTICATION');
    expect(result.mfaState).toBe('NOT_ENROLLED');
  });

  it('derives REPLACEMENT_REQUIRED MFA when a replacement is pending', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot({
        mfaEnrollments: [{ properties: { enrollmentState: 'REPLACEMENT_REQUIRED' } } as never],
      }),
    );

    const result = await service.readAuthenticationState({
      identityId: new UuidV7(IDENTITY_ID),
    });

    expect(result.mfaState).toBe('REPLACEMENT_REQUIRED');
  });

  it('reports REQUESTED deletion state when a deletion marker exists', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot({
        identity: new Identity({
          identityId: new UuidV7(IDENTITY_ID),
          identityState: 'ACTIVE',
          verificationState: 'VERIFIED',
          aggregateVersion: new AggregateVersion(3),
          createdAt: new Date(FIXED_NOW.getTime() - 24 * 3_600_000),
          updatedAt: FIXED_NOW,
          deletionRequestedAt: FIXED_NOW,
        }),
      }),
    );

    const result = await service.readAuthenticationState({
      identityId: new UuidV7(IDENTITY_ID),
    });

    expect(result.deletionState).toBe('REQUESTED');
  });

  it('fails closed with RESOURCE_NOT_AVAILABLE for an unknown identity', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(null);

    await expect(
      service.readAuthenticationState({ identityId: new UuidV7(IDENTITY_ID) }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
  });
});

describe('IdentityLifecycleApplicationService.changeIdentityState (M01-ID-004)', () => {
  it('commits an approved ACTIVE to LOCKED transition with a state transition record', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    const result = await service.changeIdentityState({
      actorIdentityId: new UuidV7(ACTOR_ID),
      targetIdentityId: new UuidV7(IDENTITY_ID),
      targetIdentityState: 'LOCKED',
      reasonCode: 'SECURITY_CONTROL',
      sourceContractReference: 'M02-CONTRACT-REF-1',
      expectedIdentityVersion: 3,
    });

    expect(result).toEqual({ identityId: IDENTITY_ID, identityState: 'LOCKED', version: 4 });
    const changeSet = identities.save.mock.calls[0]?.[0];
    expect(changeSet?.identity.properties.identityState).toBe('LOCKED');
    expect(changeSet?.identity.properties.aggregateVersion.value).toBe(4);
    const transition = changeSet?.stateTransitionsToAppend[0]?.properties;
    expect(transition).toMatchObject({
      fromState: 'ACTIVE',
      toState: 'LOCKED',
      stateVersion: 4,
      reasonCode: 'SECURITY_CONTROL',
      sourceReference: 'M02-CONTRACT-REF-1',
    });
  });

  it('revokes the identity sessions when the target state prevents authentication', async () => {
    const { service, identities, sessions } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    await service.changeIdentityState({
      actorIdentityId: new UuidV7(ACTOR_ID),
      targetIdentityId: new UuidV7(IDENTITY_ID),
      targetIdentityState: 'DISABLED',
      reasonCode: 'ADMIN_DISABLE',
      sourceContractReference: 'M02-CONTRACT-REF-2',
      expectedIdentityVersion: 3,
    });

    const revocation = sessions.revokeAllSessionsForRecovery.mock.calls[0]?.[0];
    expect(revocation).toMatchObject({
      identityId: new UuidV7(IDENTITY_ID),
      revokedAt: FIXED_NOW,
      revocationReason: 'IDENTITY_DISABLED',
    });
    expect(changeSetOf(identities)?.identity.properties.disabledAt).toBe(FIXED_NOW);
  });

  it('does not revoke sessions when the target state still permits authentication', async () => {
    const { service, identities, sessions } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot({
        identity: new Identity({
          identityId: new UuidV7(IDENTITY_ID),
          identityState: 'SUSPENDED',
          verificationState: 'VERIFIED',
          aggregateVersion: new AggregateVersion(3),
          createdAt: new Date(FIXED_NOW.getTime() - 24 * 3_600_000),
          updatedAt: FIXED_NOW,
        }),
      }),
    );

    await service.changeIdentityState({
      actorIdentityId: new UuidV7(ACTOR_ID),
      targetIdentityId: new UuidV7(IDENTITY_ID),
      targetIdentityState: 'ACTIVE',
      reasonCode: 'REINSTATEMENT',
      sourceContractReference: 'M02-CONTRACT-REF-3',
      expectedIdentityVersion: 3,
    });

    expect(sessions.revokeAllSessionsForRecovery.mock.calls).toHaveLength(0);
  });

  it('denies the transition when Module 02 authorization is refused', async () => {
    const { service, identities, authorization } = createFixture({ authorized: false });
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    await expect(
      service.changeIdentityState({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetIdentityState: 'LOCKED',
        reasonCode: 'SECURITY_CONTROL',
        sourceContractReference: 'M02-CONTRACT-REF-4',
        expectedIdentityVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(authorization.authorizeStateChange.mock.calls[0]?.[0]).toMatchObject({
      actorIdentityId: new UuidV7(ACTOR_ID),
      targetIdentityId: new UuidV7(IDENTITY_ID),
      targetIdentityState: 'LOCKED',
      sourceContractReference: 'M02-CONTRACT-REF-4',
    });
    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('rejects a transition that is not on the approved state machine', async () => {
    const { service, identities } = createFixture();
    // PENDING_VERIFICATION may only advance to ACTIVE; a direct administrative
    // transition is not on the approved Part 1 state machine.
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot({
        identity: new Identity({
          identityId: new UuidV7(IDENTITY_ID),
          identityState: 'PENDING_VERIFICATION',
          verificationState: 'PENDING_VERIFICATION',
          aggregateVersion: new AggregateVersion(3),
          createdAt: new Date(FIXED_NOW.getTime() - 24 * 3_600_000),
          updatedAt: FIXED_NOW,
        }),
      }),
    );

    await expect(
      service.changeIdentityState({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetIdentityState: 'SUSPENDED',
        reasonCode: 'SECURITY_CONTROL',
        sourceContractReference: 'M02-CONTRACT-REF-5',
        expectedIdentityVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_IDENTITY_STATE_TRANSITION' });
    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('rejects a no-op transition', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    await expect(
      service.changeIdentityState({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetIdentityState: 'ACTIVE',
        reasonCode: 'SECURITY_CONTROL',
        sourceContractReference: 'M02-CONTRACT-REF-6',
        expectedIdentityVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_IDENTITY_STATE_TRANSITION' });
    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('rejects a stale identity version precondition', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    await expect(
      service.changeIdentityState({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetIdentityState: 'LOCKED',
        reasonCode: 'SECURITY_CONTROL',
        sourceContractReference: 'M02-CONTRACT-REF-7',
        expectedIdentityVersion: 2,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('maps a concurrent aggregate conflict to RESOURCE_STATE_CONFLICT', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());
    identities.save.mockRejectedValue(new OptimisticConcurrencyError('Identity aggregate'));

    await expect(
      service.changeIdentityState({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetIdentityState: 'LOCKED',
        reasonCode: 'SECURITY_CONTROL',
        sourceContractReference: 'M02-CONTRACT-REF-8',
        expectedIdentityVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
  });

  it('fails closed with RESOURCE_NOT_AVAILABLE for an unknown identity', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(null);

    await expect(
      service.changeIdentityState({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetIdentityState: 'LOCKED',
        reasonCode: 'SECURITY_CONTROL',
        sourceContractReference: 'M02-CONTRACT-REF-9',
        expectedIdentityVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
    expect(identities.save.mock.calls).toHaveLength(0);
  });
});

function changeSetOf(
  identities: jest.Mocked<IdentityRepository>,
): Parameters<IdentityRepository['save']>[0] | undefined {
  return identities.save.mock.calls[0]?.[0];
}
