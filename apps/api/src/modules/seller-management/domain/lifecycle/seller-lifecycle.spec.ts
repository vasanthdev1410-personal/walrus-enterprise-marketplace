import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerProfile } from '../entities/seller-profile';
import { SellerLifecycle } from './seller-lifecycle';
import type { SellerActor, SellerTransitionCommand } from './seller-lifecycle';
import type { SellerState } from '../value-objects/seller-state';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const ORG = new UuidV7('0191310f-789a-7123-8123-000000000002');
const OWNER = new UuidV7('0191310f-789a-7123-8123-000000000003');
const MEMBER = new UuidV7('0191310f-789a-7123-8123-000000000004');
const REVIEWER = new UuidV7('0191310f-789a-7123-8123-000000000005');
const APPROVER = new UuidV7('0191310f-789a-7123-8123-000000000006');
const ADMIN = new UuidV7('0191310f-789a-7123-8123-000000000007');
const TRANSITION_ID = new UuidV7('0191310f-789a-7123-8123-000000000099');
const NOW = new Date('2026-08-12T00:00:00.000Z');

function profile(state: SellerState, version = 1): SellerProfile {
  return new SellerProfile({
    sellerProfileId: SELLER,
    organizationId: ORG,
    state,
    complianceState: 'NOT_STARTED',
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function actor(identityId: UuidV7, kind: SellerActor['kind']): SellerActor {
  return { identityId, kind };
}

function command(
  sellerProfile: SellerProfile,
  toState: SellerState,
  actorValue: SellerActor,
  overrides: Partial<SellerTransitionCommand> = {},
): SellerTransitionCommand {
  return {
    sellerProfile,
    toState,
    actor: actorValue,
    now: NOW,
    transitionId: TRANSITION_ID,
    ...overrides,
  };
}

describe('SellerLifecycle (M03-M1 state machine, WEMP-M03-SPEC-001 §4)', () => {
  const lifecycle = new SellerLifecycle();

  describe('DRAFT → SUBMITTED', () => {
    it('permits the OWNER to submit complete onboarding', () => {
      const result = lifecycle.transition(
        command(profile('DRAFT'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER'), {
          onboardingComplete: true,
        }),
      );
      expect(result.properties.toState).toBe('SUBMITTED');
      expect(result.properties.fromState).toBe('DRAFT');
      expect(result.properties.actorKind).toBe('SELLER_OWNER');
    });

    it('fails closed when onboarding is incomplete (precondition)', () => {
      expect(() =>
        lifecycle.transition(command(profile('DRAFT'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER'))),
      ).toThrow('SELLER_PRECONDITION_FAILED');
    });

    it('denies a non-owner member from submitting', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('DRAFT'), 'SUBMITTED', actor(MEMBER, 'SELLER_MEMBER'), {
            onboardingComplete: true,
          }),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
    });

    it('denies an admin from submitting on behalf of the seller', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('DRAFT'), 'SUBMITTED', actor(ADMIN, 'ADMIN'), {
            onboardingComplete: true,
          }),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
    });
  });

  describe('SUBMITTED → UNDER_REVIEW', () => {
    it('permits an admin reviewer to open review', () => {
      expect(
        lifecycle.transition(
          command(profile('SUBMITTED'), 'UNDER_REVIEW', actor(REVIEWER, 'ADMIN_REVIEWER')),
        ).properties.toState,
      ).toBe('UNDER_REVIEW');
    });

    it('denies the seller from opening review', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('SUBMITTED'), 'UNDER_REVIEW', actor(OWNER, 'SELLER_OWNER')),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
    });
  });

  describe('UNDER_REVIEW → CORRECTIONS_REQUESTED', () => {
    it('permits the reviewer to request corrections with a reason', () => {
      expect(
        lifecycle.transition(
          command(
            profile('UNDER_REVIEW'),
            'CORRECTIONS_REQUESTED',
            actor(REVIEWER, 'ADMIN_REVIEWER'),
            {
              reasonReference: 'crv:missing-pan-document',
            },
          ),
        ).properties.toState,
      ).toBe('CORRECTIONS_REQUESTED');
    });

    it('requires a reason reference (fail closed)', () => {
      expect(() =>
        lifecycle.transition(
          command(
            profile('UNDER_REVIEW'),
            'CORRECTIONS_REQUESTED',
            actor(REVIEWER, 'ADMIN_REVIEWER'),
          ),
        ),
      ).toThrow('SELLER_REASON_REQUIRED');
    });
  });

  describe('CORRECTIONS_REQUESTED → SUBMITTED', () => {
    it('permits the OWNER to resubmit corrected onboarding', () => {
      expect(
        lifecycle.transition(
          command(profile('CORRECTIONS_REQUESTED'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER')),
        ).properties.toState,
      ).toBe('SUBMITTED');
    });

    it('denies a member from resubmitting', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('CORRECTIONS_REQUESTED'), 'SUBMITTED', actor(MEMBER, 'SELLER_MEMBER')),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
    });
  });

  describe('UNDER_REVIEW → APPROVED', () => {
    it('permits a distinct approver when all mandatory verifications are approved', () => {
      const result = lifecycle.transition(
        command(profile('UNDER_REVIEW'), 'APPROVED', actor(APPROVER, 'ADMIN_APPROVER'), {
          reviewerIdentityId: REVIEWER,
          mandatoryVerificationsApproved: true,
        }),
      );
      expect(result.properties.toState).toBe('APPROVED');
    });

    it('fails closed when mandatory verifications are not all approved', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('UNDER_REVIEW'), 'APPROVED', actor(APPROVER, 'ADMIN_APPROVER'), {
            reviewerIdentityId: REVIEWER,
          }),
        ),
      ).toThrow('SELLER_PRECONDITION_FAILED');
    });

    it('enforces separation of duties: approver cannot be the reviewer', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('UNDER_REVIEW'), 'APPROVED', actor(REVIEWER, 'ADMIN_APPROVER'), {
            reviewerIdentityId: REVIEWER,
            mandatoryVerificationsApproved: true,
          }),
        ),
      ).toThrow('SELLER_SOD_VIOLATION');
    });

    it('fails closed when the reviewer identity is unknown', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('UNDER_REVIEW'), 'APPROVED', actor(APPROVER, 'ADMIN_APPROVER'), {
            mandatoryVerificationsApproved: true,
          }),
        ),
      ).toThrow('SELLER_SOD_VIOLATION');
    });

    it('denies the reviewing admin from self-approving via the reviewer kind', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('UNDER_REVIEW'), 'APPROVED', actor(REVIEWER, 'ADMIN_REVIEWER'), {
            reviewerIdentityId: REVIEWER,
            mandatoryVerificationsApproved: true,
          }),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
    });
  });

  describe('APPROVED → ACTIVE', () => {
    it('activates only after the SELLER role assignment is granted (SYSTEM)', () => {
      const result = lifecycle.transition(
        command(profile('APPROVED'), 'ACTIVE', actor(ADMIN, 'SYSTEM'), {
          roleAssignmentGranted: true,
        }),
      );
      expect(result.properties.toState).toBe('ACTIVE');
    });

    it('fails closed when the role assignment was not granted', () => {
      expect(() =>
        lifecycle.transition(command(profile('APPROVED'), 'ACTIVE', actor(ADMIN, 'SYSTEM'))),
      ).toThrow('SELLER_PRECONDITION_FAILED');
    });

    it('denies a human admin from activating directly', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('APPROVED'), 'ACTIVE', actor(ADMIN, 'ADMIN'), {
            roleAssignmentGranted: true,
          }),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
    });
  });

  describe('ACTIVE → SUSPENDED / SUSPENDED → ACTIVE', () => {
    it('permits an admin to suspend with a reason', () => {
      const result = lifecycle.transition(
        command(profile('ACTIVE'), 'SUSPENDED', actor(ADMIN, 'ADMIN'), {
          reasonReference: 'spd:policy-violation',
        }),
      );
      expect(result.properties.toState).toBe('SUSPENDED');
    });

    it('requires a suspension reason (fail closed)', () => {
      expect(() =>
        lifecycle.transition(command(profile('ACTIVE'), 'SUSPENDED', actor(ADMIN, 'ADMIN'))),
      ).toThrow('SELLER_REASON_REQUIRED');
    });

    it('denies the owner from self-suspending', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('ACTIVE'), 'SUSPENDED', actor(OWNER, 'SELLER_OWNER'), {
            reasonReference: 'spd:voluntary',
          }),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
    });

    it('permits an admin to reactivate a suspended seller', () => {
      expect(
        lifecycle.transition(command(profile('SUSPENDED'), 'ACTIVE', actor(ADMIN, 'ADMIN')))
          .properties.toState,
      ).toBe('ACTIVE');
    });
  });

  describe('Closure (terminal)', () => {
    it('permits voluntary owner closure from ACTIVE with a reason', () => {
      expect(
        lifecycle.transition(
          command(profile('ACTIVE'), 'CLOSED', actor(OWNER, 'SELLER_OWNER'), {
            reasonReference: 'cls:voluntary',
          }),
        ).properties.toState,
      ).toBe('CLOSED');
    });

    it('permits administrative closure from SUSPENDED with a reason', () => {
      expect(
        lifecycle.transition(
          command(profile('SUSPENDED'), 'CLOSED', actor(ADMIN, 'ADMIN'), {
            reasonReference: 'cls:administrative',
          }),
        ).properties.toState,
      ).toBe('CLOSED');
    });

    it('permits withdrawal from APPROVED before activation (D-07 default: terminal CLOSED)', () => {
      expect(
        lifecycle.transition(
          command(profile('APPROVED'), 'CLOSED', actor(OWNER, 'SELLER_OWNER'), {
            reasonReference: 'cls:withdrawal',
          }),
        ).properties.toState,
      ).toBe('CLOSED');
    });

    it('requires a closure reason (fail closed)', () => {
      expect(() =>
        lifecycle.transition(command(profile('ACTIVE'), 'CLOSED', actor(OWNER, 'SELLER_OWNER'))),
      ).toThrow('SELLER_REASON_REQUIRED');
    });
  });

  describe('Rejection (terminal)', () => {
    it('permits an approver to reject a submitted seller with a reason', () => {
      expect(
        lifecycle.transition(
          command(profile('SUBMITTED'), 'REJECTED', actor(APPROVER, 'ADMIN_APPROVER'), {
            reasonReference: 'rej:ineligible-business',
          }),
        ).properties.toState,
      ).toBe('REJECTED');
    });

    it('enforces separation of duties when rejecting out of UNDER_REVIEW', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('UNDER_REVIEW'), 'REJECTED', actor(REVIEWER, 'ADMIN_APPROVER'), {
            reviewerIdentityId: REVIEWER,
            reasonReference: 'rej:ineligible-business',
          }),
        ),
      ).toThrow('SELLER_SOD_VIOLATION');
    });

    it('requires a rejection reason (fail closed)', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('CORRECTIONS_REQUESTED'), 'REJECTED', actor(APPROVER, 'ADMIN_APPROVER')),
        ),
      ).toThrow('SELLER_REASON_REQUIRED');
    });
  });

  describe('General fail-closed behavior', () => {
    it('rejects same-state transitions', () => {
      expect(() =>
        lifecycle.transition(command(profile('DRAFT'), 'DRAFT', actor(OWNER, 'SELLER_OWNER'))),
      ).toThrow('SELLER_STATE_CONFLICT');
    });

    it('rejects transitions from terminal states (REJECTED, CLOSED)', () => {
      for (const terminal of ['REJECTED', 'CLOSED'] as const) {
        expect(() =>
          lifecycle.transition(command(profile(terminal), 'ACTIVE', actor(ADMIN, 'ADMIN'))),
        ).toThrow('SELLER_STATE_CONFLICT');
        expect(() =>
          lifecycle.transition(
            command(profile(terminal), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER')),
          ),
        ).toThrow('SELLER_STATE_CONFLICT');
      }
    });

    it('rejects transitions that skip required intermediate states', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('DRAFT'), 'ACTIVE', actor(ADMIN, 'ADMIN'), {
            roleAssignmentGranted: true,
          }),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
      expect(() =>
        lifecycle.transition(
          command(profile('SUBMITTED'), 'APPROVED', actor(APPROVER, 'ADMIN_APPROVER'), {
            reviewerIdentityId: REVIEWER,
            mandatoryVerificationsApproved: true,
          }),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
    });

    it('rejects transitions by an unknown actor kind (no silent permissiveness)', () => {
      expect(() =>
        lifecycle.transition(
          command(profile('SUBMITTED'), 'UNDER_REVIEW', actor(REVIEWER, 'BOGUS' as never)),
        ),
      ).toThrow('SELLER_TRANSITION_FORBIDDEN');
    });

    it('canTransition returns false instead of throwing for denied transitions', () => {
      expect(
        lifecycle.canTransition(
          command(profile('DRAFT'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER')),
        ),
      ).toBe(false);
      expect(
        lifecycle.canTransition(
          command(profile('DRAFT'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER'), {
            onboardingComplete: true,
          }),
        ),
      ).toBe(true);
    });
  });

  describe('updatedProfile (version-guarded state application)', () => {
    it('advances the aggregate version and lifecycle timestamps', () => {
      const submitted = lifecycle.updatedProfile(profile('DRAFT'), 'SUBMITTED', NOW);
      expect(submitted.properties.state).toBe('SUBMITTED');
      expect(submitted.properties.aggregateVersion.value).toBe(2);
      expect(submitted.properties.submittedAt).toEqual(NOW);

      const approved = lifecycle.updatedProfile(profile('UNDER_REVIEW', 3), 'APPROVED', NOW);
      expect(approved.properties.state).toBe('APPROVED');
      expect(approved.properties.approvedAt).toEqual(NOW);
      expect(approved.properties.aggregateVersion.value).toBe(4);

      const suspended = lifecycle.updatedProfile(profile('ACTIVE', 2), 'SUSPENDED', NOW);
      expect(suspended.properties.state).toBe('SUSPENDED');
      expect(suspended.properties.suspendedAt).toEqual(NOW);

      const closed = lifecycle.updatedProfile(profile('ACTIVE', 2), 'CLOSED', NOW);
      expect(closed.properties.state).toBe('CLOSED');
      expect(closed.properties.closedAt).toEqual(NOW);
    });
  });

  describe('assertCanUpdate (profile updates never change lifecycle state)', () => {
    it('permits updates in DRAFT, CORRECTIONS_REQUESTED, ACTIVE and SUSPENDED', () => {
      for (const state of ['DRAFT', 'CORRECTIONS_REQUESTED', 'ACTIVE', 'SUSPENDED'] as const) {
        expect(() => {
          lifecycle.assertCanUpdate(state);
        }).not.toThrow();
      }
    });

    it('denies updates while locked for review or terminal', () => {
      for (const state of [
        'SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
        'REJECTED',
        'CLOSED',
      ] as const) {
        expect(() => {
          lifecycle.assertCanUpdate(state);
        }).toThrow('SELLER_UPDATE_FORBIDDEN');
      }
    });
  });

  describe('transition record invariants', () => {
    it('records the actor identity and kind for audit', () => {
      const result = lifecycle.transition(
        command(profile('ACTIVE'), 'SUSPENDED', actor(ADMIN, 'ADMIN'), {
          reasonReference: 'spd:reason',
          transitionId: TRANSITION_ID,
        }),
      );
      expect(result.properties.actorIdentityId.value).toBe(ADMIN.value);
      expect(result.properties.actorKind).toBe('ADMIN');
      expect(result.properties.reasonReference).toBe('spd:reason');
      expect(result.properties.sellerStateTransitionId.value).toBe(TRANSITION_ID.value);
      expect(result.properties.stateVersion).toBe(2);
    });
  });
});
