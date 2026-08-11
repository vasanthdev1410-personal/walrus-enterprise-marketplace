import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { Identity } from '../../domain/identity/entities/identity';
import { AuthenticationSecurityClassificationAssignment } from '../../domain/identity/entities/authentication-security-classification-assignment';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { ClassificationTransitionCoordinationPort } from '../ports/classification-transition-coordination.port';
import { ClassificationTransitionApplicationService } from './classification-transition-application.service';

const IDENTITY_ID = '0191310f-789a-7123-8123-000000000001';
const ACTOR_ID = '0191310f-789a-7123-8123-000000000002';
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

function buildAssignment(
  overrides: Partial<AuthenticationSecurityClassificationAssignment['properties']> = {},
): AuthenticationSecurityClassificationAssignment {
  return new AuthenticationSecurityClassificationAssignment({
    classificationAssignmentId: new UuidV7('0191310f-789a-7123-8123-0000000000c1'),
    identityId: new UuidV7(IDENTITY_ID),
    classification: 'STANDARD_AUTHENTICATION',
    effectiveAt: FIXED_NOW,
    assignmentState: 'EFFECTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  });
}

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
    classificationAssignments: [buildAssignment()],
    mfaEnrollments: [],
    mfaFactors: [],
    trustedDevices: [],
    ...overrides,
  };
}

function createFixture(contractValid = true): {
  service: ClassificationTransitionApplicationService;
  identities: jest.Mocked<IdentityRepository>;
  coordination: jest.Mocked<ClassificationTransitionCoordinationPort>;
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
  const coordination: jest.Mocked<ClassificationTransitionCoordinationPort> = {
    validateContract: jest.fn().mockResolvedValue({ contractValid }),
  };
  const service = new ClassificationTransitionApplicationService(
    identities,
    coordination,
    { now: () => FIXED_NOW },
    { next: () => new UuidV7('0191310f-789a-7123-8123-0000000000cc') },
  );
  return { service, identities, coordination };
}

function changeSetOf(
  identities: jest.Mocked<IdentityRepository>,
): Parameters<IdentityRepository['save']>[0] | undefined {
  return identities.save.mock.calls[0]?.[0];
}

describe('ClassificationTransitionApplicationService.transitionClassification (M01-CLS-001)', () => {
  it('ends the current EFFECTIVE assignment and creates the target classification', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    const result = await service.transitionClassification({
      actorIdentityId: new UuidV7(ACTOR_ID),
      targetIdentityId: new UuidV7(IDENTITY_ID),
      targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      reasonCode: 'ADMIN_PROVISIONED',
      sourceContractReference: 'M02-CONTRACT-CLS-1',
      expectedIdentityVersion: 3,
    });

    expect(result).toEqual({
      identityId: IDENTITY_ID,
      authenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      version: 4,
    });
    const changeSet = changeSetOf(identities);
    const assignments = changeSet?.classificationAssignments ?? [];
    expect(assignments).toHaveLength(2);
    const ended = assignments[0]?.properties;
    expect(ended?.assignmentState).toBe('ENDED');
    expect(ended?.endedAt).toBe(FIXED_NOW);
    expect(ended?.classification).toBe('STANDARD_AUTHENTICATION');
    const created = assignments[1]?.properties;
    expect(created).toMatchObject({
      classification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      assignmentState: 'EFFECTIVE',
      effectiveAt: FIXED_NOW,
      sourceContractReference: 'M02-CONTRACT-CLS-1',
      reasonCode: 'ADMIN_PROVISIONED',
      aggregateVersion: new AggregateVersion(1),
    });
    expect(changeSet?.identity.properties.aggregateVersion.value).toBe(4);
  });

  it('validates the approved coordination contract at decision time', async () => {
    const { service, identities, coordination } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    await service.transitionClassification({
      actorIdentityId: new UuidV7(ACTOR_ID),
      targetIdentityId: new UuidV7(IDENTITY_ID),
      targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      reasonCode: 'ADMIN_PROVISIONED',
      sourceContractReference: 'M02-CONTRACT-CLS-2',
      expectedIdentityVersion: 3,
    });

    expect(coordination.validateContract.mock.calls[0]?.[0]).toMatchObject({
      actorIdentityId: new UuidV7(ACTOR_ID),
      targetIdentityId: new UuidV7(IDENTITY_ID),
      targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      sourceContractReference: 'M02-CONTRACT-CLS-2',
    });
  });

  it('fails closed with CONTRACT_INVALID when no approved contract is present', async () => {
    const { service, identities } = createFixture(false);
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    await expect(
      service.transitionClassification({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetAuthenticationSecurityClassification: 'SUPER_ADMIN_AUTHENTICATION',
        reasonCode: 'BOOTSTRAP',
        sourceContractReference: 'M02-CONTRACT-CLS-3',
        expectedIdentityVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('rejects a no-op transition to the current classification', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    await expect(
      service.transitionClassification({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetAuthenticationSecurityClassification: 'STANDARD_AUTHENTICATION',
        reasonCode: 'NOOP',
        sourceContractReference: 'M02-CONTRACT-CLS-4',
        expectedIdentityVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('rejects a stale identity version precondition', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot());

    await expect(
      service.transitionClassification({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        reasonCode: 'ADMIN_PROVISIONED',
        sourceContractReference: 'M02-CONTRACT-CLS-5',
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
      service.transitionClassification({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        reasonCode: 'ADMIN_PROVISIONED',
        sourceContractReference: 'M02-CONTRACT-CLS-6',
        expectedIdentityVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
  });

  it('fails closed with RESOURCE_NOT_AVAILABLE for an unknown identity', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(null);

    await expect(
      service.transitionClassification({
        actorIdentityId: new UuidV7(ACTOR_ID),
        targetIdentityId: new UuidV7(IDENTITY_ID),
        targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        reasonCode: 'ADMIN_PROVISIONED',
        sourceContractReference: 'M02-CONTRACT-CLS-7',
        expectedIdentityVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
  });
});
