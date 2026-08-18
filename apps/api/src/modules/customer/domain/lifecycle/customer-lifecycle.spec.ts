import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerProfile } from '../entities/customer-profile';
import { CustomerLifecycle } from './customer-lifecycle';
import type { CustomerActor, CustomerTransitionCommand } from './customer-lifecycle';
import type { CustomerState } from '../value-objects/customer-state';

const PROFILE = new UuidV7('0191310f-789a-7123-8123-000000000001');
const IDENTITY = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ADMIN = new UuidV7('0191310f-789a-7123-8123-000000000003');
const TRANSITION_ID = new UuidV7('0191310f-789a-7123-8123-000000000099');
const NOW = new Date('2026-08-17T00:00:00.000Z');

function profile(state: CustomerState, version = 1): CustomerProfile {
  return new CustomerProfile({
    customerProfileId: PROFILE,
    identityId: IDENTITY,
    state,
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function admin(identityId: UuidV7 = ADMIN): CustomerActor {
  return { identityId, kind: 'ADMIN' };
}

function command(
  customerProfile: CustomerProfile,
  toState: CustomerState,
  actor: CustomerActor,
  overrides: Partial<CustomerTransitionCommand> = {},
): CustomerTransitionCommand {
  return {
    customerProfile,
    toState,
    actor,
    now: NOW,
    transitionId: TRANSITION_ID,
    reasonReference: 'adm:review-2026-08-17',
    ...overrides,
  };
}

describe('CustomerLifecycle (M06-M1 state machine, WEMP-M06-SPEC-001 §5)', () => {
  const lifecycle = new CustomerLifecycle();

  describe('Approved transition matrix', () => {
    it('permits ACTIVE → SUSPENDED with an ADMIN actor and a reason', () => {
      const result = lifecycle.transition(
        command(profile('ACTIVE'), 'SUSPENDED', admin(), {
          reasonReference: 'spd:policy-violation',
        }),
      );
      expect(result.properties.toState).toBe('SUSPENDED');
      expect(result.properties.fromState).toBe('ACTIVE');
      expect(result.properties.actorKind).toBe('ADMIN');
      expect(result.properties.reasonReference).toBe('spd:policy-violation');
      expect(result.properties.stateVersion).toBe(2);
    });

    it('permits SUSPENDED → ACTIVE with an ADMIN actor and a reason', () => {
      const result = lifecycle.transition(
        command(profile('SUSPENDED', 2), 'ACTIVE', admin(), {
          reasonReference: 'rst:issue-resolved',
        }),
      );
      expect(result.properties.toState).toBe('ACTIVE');
    });

    it('permits ACTIVE → CLOSED with an ADMIN actor and a reason', () => {
      const result = lifecycle.transition(
        command(profile('ACTIVE'), 'CLOSED', admin(), {
          reasonReference: 'cls:administrative',
        }),
      );
      expect(result.properties.toState).toBe('CLOSED');
    });

    it('permits SUSPENDED → CLOSED with an ADMIN actor and a reason', () => {
      const result = lifecycle.transition(
        command(profile('SUSPENDED', 2), 'CLOSED', admin(), {
          reasonReference: 'cls:administrative',
        }),
      );
      expect(result.properties.toState).toBe('CLOSED');
    });
  });

  describe('CLOSED is terminal', () => {
    it('rejects every transition out of CLOSED (fail closed)', () => {
      for (const toState of ['ACTIVE', 'SUSPENDED'] as const) {
        expect(() =>
          lifecycle.transition(
            command(profile('CLOSED', 3), toState, admin(), {
              reasonReference: 'rst:reopen',
            }),
          ),
        ).toThrow('CUSTOMER_STATE_CONFLICT');
      }
    });
  });

  describe('Invalid transitions are denied', () => {
    it('rejects same-state transitions', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('ACTIVE'), 'ACTIVE', admin(), {
            reasonReference: 'spd:noop',
          }),
        ),
      ).toThrow('CUSTOMER_STATE_CONFLICT');
    });

    it('rejects transitions that skip the approved matrix (SUSPENDED → SUSPENDED only, CLOSED → ACTIVE)', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('ACTIVE'), 'ACTIVE', admin(), { reasonReference: 'x' }),
        ),
      ).toThrow('CUSTOMER_STATE_CONFLICT');
      expect(() =>
        lifecycle.transition(
          command(profile('CLOSED'), 'ACTIVE', admin(), { reasonReference: 'x' }),
        ),
      ).toThrow('CUSTOMER_STATE_CONFLICT');
    });

    it('denies transitions by an unknown actor kind (no silent permissiveness)', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('ACTIVE'), 'SUSPENDED', {
            identityId: ADMIN,
            kind: 'BOGUS' as never,
          }),
        ),
      ).toThrow('CUSTOMER_TRANSITION_FORBIDDEN');
    });

    it('requires a non-empty reason reference on every transition (fail closed)', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('ACTIVE'), 'SUSPENDED', admin(), {
            reasonReference: '   ',
          }),
        ),
      ).toThrow('CUSTOMER_REASON_REQUIRED');
    });
  });

  describe('Stale version rejection (D-11 optimistic concurrency)', () => {
    it('rejects a transition whose expectedVersion does not match the profile', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('ACTIVE', 2), 'SUSPENDED', admin(), {
            expectedVersion: 1,
            reasonReference: 'spd:reason',
          }),
        ),
      ).toThrow('CUSTOMER_STATE_CONFLICT');
    });

    it('accepts a transition whose expectedVersion matches the profile', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('ACTIVE', 2), 'SUSPENDED', admin(), {
            expectedVersion: 2,
            reasonReference: 'spd:reason',
          }),
        ),
      ).not.toThrow();
    });
  });

  describe('canTransition', () => {
    it('returns false instead of throwing for denied transitions', () => {
      expect(
        lifecycle.canTransition(
          command(profile('ACTIVE'), 'SUSPENDED', admin(), {
            reasonReference: '  ',
          }),
        ),
      ).toBe(false);
      expect(
        lifecycle.canTransition(
          command(profile('ACTIVE'), 'SUSPENDED', admin(), {
            reasonReference: 'spd:reason',
          }),
        ),
      ).toBe(true);
    });
  });

  describe('updatedProfile (version-guarded state application)', () => {
    it('advances the aggregate version and lifecycle timestamps', () => {
      const suspended = lifecycle.updatedProfile(profile('ACTIVE'), 'SUSPENDED', NOW);
      expect(suspended.properties.state).toBe('SUSPENDED');
      expect(suspended.properties.aggregateVersion.value).toBe(2);
      expect(suspended.properties.suspendedAt).toEqual(NOW);
      expect(suspended.properties.closedAt).toBeUndefined();

      const closed = lifecycle.updatedProfile(profile('ACTIVE', 2), 'CLOSED', NOW);
      expect(closed.properties.state).toBe('CLOSED');
      expect(closed.properties.closedAt).toEqual(NOW);
      expect(closed.properties.aggregateVersion.value).toBe(3);
    });
  });

  describe('Suspended/closed restrictions (WEMP-M06-SPEC-001 §5)', () => {
    it('denies self-service mutations while SUSPENDED (fail closed)', () => {
      expect(() => {
        lifecycle.assertCanMutate('SUSPENDED');
      }).toThrow('CUSTOMER_UPDATE_FORBIDDEN');
    });

    it('denies self-service mutations and reads while CLOSED', () => {
      expect(() => {
        lifecycle.assertCanMutate('CLOSED');
      }).toThrow('CUSTOMER_UPDATE_FORBIDDEN');
      expect(() => {
        lifecycle.assertCanSelfRead('CLOSED');
      }).toThrow('CUSTOMER_READ_FORBIDDEN');
    });

    it('permits self-service mutations only while ACTIVE', () => {
      expect(() => {
        lifecycle.assertCanMutate('ACTIVE');
      }).not.toThrow();
      expect(() => {
        lifecycle.assertCanMutate('SUSPENDED');
      }).toThrow('CUSTOMER_UPDATE_FORBIDDEN');
    });

    it('permits self-service reads while ACTIVE and SUSPENDED (per grant only)', () => {
      expect(() => {
        lifecycle.assertCanSelfRead('ACTIVE');
      }).not.toThrow();
      expect(() => {
        lifecycle.assertCanSelfRead('SUSPENDED');
      }).not.toThrow();
    });
  });

  describe('transition record invariants', () => {
    it('records the actor identity and reason for audit', () => {
      const result = lifecycle.transition(
        command(profile('ACTIVE'), 'SUSPENDED', admin(), {
          reasonReference: 'spd:policy-violation',
        }),
      );
      expect(result.properties.actorIdentityId.value).toBe(ADMIN.value);
      expect(result.properties.transitionId.value).toBe(TRANSITION_ID.value);
      expect(result.properties.stateVersion).toBe(2);
      expect(result.properties.customerProfileId.value).toBe(PROFILE.value);
    });
  });
});
