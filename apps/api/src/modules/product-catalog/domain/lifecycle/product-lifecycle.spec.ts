import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Product } from '../entities/product';
import { ProductLifecycle } from './product-lifecycle';
import type { ProductActor, ProductTransitionCommand } from './product-lifecycle';
import type { ProductState } from '../value-objects/product-state';
import { Price } from '../value-objects/price';

const PRODUCT = new UuidV7('0191310f-789a-7123-8123-000000000101');
const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000102');
const CATEGORY = new UuidV7('0191310f-789a-7123-8123-000000000103');
const OWNER = new UuidV7('0191310f-789a-7123-8123-000000000104');
const MEMBER = new UuidV7('0191310f-789a-7123-8123-000000000105');
const REVIEWER = new UuidV7('0191310f-789a-7123-8123-000000000106');
const APPROVER = new UuidV7('0191310f-789a-7123-8123-000000000107');
const ADMIN = new UuidV7('0191310f-789a-7123-8123-000000000108');
const TRANSITION_ID = new UuidV7('0191310f-789a-7123-8123-000000000199');
const NOW = new Date('2026-08-14T00:00:00.000Z');

function product(state: ProductState, version = 1): Product {
  return new Product({
    productId: PRODUCT,
    sellerProfileId: SELLER,
    categoryId: CATEGORY,
    name: 'Walrus Espresso Machine',
    state,
    sellingPrice: new Price(249.99),
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function actor(identityId: UuidV7, kind: ProductActor['kind']): ProductActor {
  return { identityId, kind };
}

function command(
  productValue: Product,
  toState: ProductState,
  actorValue: ProductActor,
  overrides: Partial<ProductTransitionCommand> = {},
): ProductTransitionCommand {
  return {
    product: productValue,
    toState,
    actor: actorValue,
    now: NOW,
    transitionId: TRANSITION_ID,
    ...overrides,
  };
}

describe('ProductLifecycle (M04-M1 state machine, WEMP-M04-SPEC-001 §5)', () => {
  const lifecycle = new ProductLifecycle();

  describe('DRAFT → SUBMITTED', () => {
    it('permits the OWNER to submit a complete product', () => {
      const result = lifecycle.transition(
        command(product('DRAFT'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER'), {
          submissionComplete: true,
        }),
      );
      expect(result.properties.toState).toBe('SUBMITTED');
      expect(result.properties.fromState).toBe('DRAFT');
      expect(result.properties.actorKind).toBe('SELLER_OWNER');
    });

    it('fails closed when the product is incomplete (precondition)', () => {
      expect(() =>
        lifecycle.transition(command(product('DRAFT'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER'))),
      ).toThrow('PRODUCT_PRECONDITION_FAILED');
    });

    it('denies a read-only MEMBER from submitting', () => {
      expect(() =>
        lifecycle.transition(
          command(product('DRAFT'), 'SUBMITTED', actor(MEMBER, 'SELLER_MEMBER'), {
            submissionComplete: true,
          }),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });

    it('denies an admin from submitting on behalf of the seller', () => {
      expect(() =>
        lifecycle.transition(
          command(product('DRAFT'), 'SUBMITTED', actor(ADMIN, 'ADMIN'), {
            submissionComplete: true,
          }),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });
  });

  describe('SUBMITTED → UNDER_REVIEW', () => {
    it('permits an admin reviewer to open review', () => {
      expect(
        lifecycle.transition(
          command(product('SUBMITTED'), 'UNDER_REVIEW', actor(REVIEWER, 'ADMIN_REVIEWER')),
        ).properties.toState,
      ).toBe('UNDER_REVIEW');
    });

    it('denies the seller from opening review', () => {
      expect(() =>
        lifecycle.transition(
          command(product('SUBMITTED'), 'UNDER_REVIEW', actor(OWNER, 'SELLER_OWNER')),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });
  });

  describe('UNDER_REVIEW → CORRECTIONS_REQUESTED', () => {
    it('permits the reviewer to request corrections with a reason', () => {
      expect(
        lifecycle.transition(
          command(
            product('UNDER_REVIEW'),
            'CORRECTIONS_REQUESTED',
            actor(REVIEWER, 'ADMIN_REVIEWER'),
            {
              reasonReference: 'crv:missing-spec-sheet',
            },
          ),
        ).properties.toState,
      ).toBe('CORRECTIONS_REQUESTED');
    });

    it('requires a reason reference (fail closed)', () => {
      expect(() =>
        lifecycle.transition(
          command(
            product('UNDER_REVIEW'),
            'CORRECTIONS_REQUESTED',
            actor(REVIEWER, 'ADMIN_REVIEWER'),
          ),
        ),
      ).toThrow('PRODUCT_REASON_REQUIRED');
    });
  });

  describe('CORRECTIONS_REQUESTED → SUBMITTED', () => {
    it('permits the OWNER to resubmit corrected product data', () => {
      expect(
        lifecycle.transition(
          command(product('CORRECTIONS_REQUESTED'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER')),
        ).properties.toState,
      ).toBe('SUBMITTED');
    });

    it('denies a MEMBER from resubmitting', () => {
      expect(() =>
        lifecycle.transition(
          command(product('CORRECTIONS_REQUESTED'), 'SUBMITTED', actor(MEMBER, 'SELLER_MEMBER')),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });
  });

  describe('UNDER_REVIEW → APPROVED', () => {
    it('permits a distinct approver (separation of duties)', () => {
      const result = lifecycle.transition(
        command(product('UNDER_REVIEW'), 'APPROVED', actor(APPROVER, 'ADMIN_APPROVER'), {
          reviewerIdentityId: REVIEWER,
        }),
      );
      expect(result.properties.toState).toBe('APPROVED');
    });

    it('enforces separation of duties: approver cannot be the reviewer', () => {
      expect(() =>
        lifecycle.transition(
          command(product('UNDER_REVIEW'), 'APPROVED', actor(REVIEWER, 'ADMIN_APPROVER'), {
            reviewerIdentityId: REVIEWER,
          }),
        ),
      ).toThrow('PRODUCT_SOD_VIOLATION');
    });

    it('fails closed when the reviewer identity is unknown', () => {
      expect(() =>
        lifecycle.transition(
          command(product('UNDER_REVIEW'), 'APPROVED', actor(APPROVER, 'ADMIN_APPROVER')),
        ),
      ).toThrow('PRODUCT_SOD_VIOLATION');
    });

    it('denies the submitting seller from approving their own product', () => {
      expect(() =>
        lifecycle.transition(
          command(product('UNDER_REVIEW'), 'APPROVED', actor(OWNER, 'SELLER_OWNER'), {
            reviewerIdentityId: REVIEWER,
          }),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });
  });

  describe('APPROVED → PUBLISHED (D-12 publication gate)', () => {
    it('publishes only through the SYSTEM gate with publication granted', () => {
      const result = lifecycle.transition(
        command(product('APPROVED'), 'PUBLISHED', actor(ADMIN, 'SYSTEM'), {
          publicationGranted: true,
        }),
      );
      expect(result.properties.toState).toBe('PUBLISHED');
    });

    it('fails closed when the publication gate has not passed', () => {
      expect(() =>
        lifecycle.transition(command(product('APPROVED'), 'PUBLISHED', actor(ADMIN, 'SYSTEM'))),
      ).toThrow('PRODUCT_PRECONDITION_FAILED');
    });

    it('denies a human admin from publishing directly', () => {
      expect(() =>
        lifecycle.transition(
          command(product('APPROVED'), 'PUBLISHED', actor(ADMIN, 'ADMIN'), {
            publicationGranted: true,
          }),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });
  });

  describe('PUBLISHED — withdrawal and re-moderation (invariant 3)', () => {
    it('permits the owner to unpublish with a reason', () => {
      expect(
        lifecycle.transition(
          command(product('PUBLISHED'), 'UNPUBLISHED', actor(OWNER, 'SELLER_OWNER'), {
            reasonReference: 'wdr:seasonal-removal',
          }),
        ).properties.toState,
      ).toBe('UNPUBLISHED');
    });

    it('requires an unpublish reason (fail closed)', () => {
      expect(() =>
        lifecycle.transition(
          command(product('PUBLISHED'), 'UNPUBLISHED', actor(OWNER, 'SELLER_OWNER')),
        ),
      ).toThrow('PRODUCT_REASON_REQUIRED');
    });

    it('permits an admin to send a PUBLISHED product back for corrections (re-moderation)', () => {
      expect(
        lifecycle.transition(
          command(product('PUBLISHED'), 'CORRECTIONS_REQUESTED', actor(ADMIN, 'ADMIN'), {
            reasonReference: 'rem:policy-violation',
          }),
        ).properties.toState,
      ).toBe('CORRECTIONS_REQUESTED');
    });

    it('denies the owner from self-triggering the corrections state', () => {
      expect(() =>
        lifecycle.transition(
          command(product('PUBLISHED'), 'CORRECTIONS_REQUESTED', actor(OWNER, 'SELLER_OWNER'), {
            reasonReference: 'rem:edit',
          }),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });

    it('permits resubmission from UNPUBLISHED (re-moderation before re-publication)', () => {
      expect(
        lifecycle.transition(
          command(product('UNPUBLISHED'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER')),
        ).properties.toState,
      ).toBe('SUBMITTED');
    });
  });

  describe('Closure (terminal)', () => {
    it('permits voluntary owner closure from APPROVED with a reason', () => {
      expect(
        lifecycle.transition(
          command(product('APPROVED'), 'CLOSED', actor(OWNER, 'SELLER_OWNER'), {
            reasonReference: 'cls:voluntary',
          }),
        ).properties.toState,
      ).toBe('CLOSED');
    });

    it('permits administrative closure from PUBLISHED with a reason', () => {
      expect(
        lifecycle.transition(
          command(product('PUBLISHED'), 'CLOSED', actor(ADMIN, 'ADMIN'), {
            reasonReference: 'cls:administrative',
          }),
        ).properties.toState,
      ).toBe('CLOSED');
    });

    it('requires a closure reason (fail closed)', () => {
      expect(() =>
        lifecycle.transition(command(product('PUBLISHED'), 'CLOSED', actor(OWNER, 'SELLER_OWNER'))),
      ).toThrow('PRODUCT_REASON_REQUIRED');
    });
  });

  describe('Rejection (terminal)', () => {
    it('permits an approver to reject a submitted product with a reason', () => {
      expect(
        lifecycle.transition(
          command(product('SUBMITTED'), 'REJECTED', actor(APPROVER, 'ADMIN_APPROVER'), {
            reasonReference: 'rej:prohibited-item',
          }),
        ).properties.toState,
      ).toBe('REJECTED');
    });

    it('enforces separation of duties when rejecting out of UNDER_REVIEW', () => {
      expect(() =>
        lifecycle.transition(
          command(product('UNDER_REVIEW'), 'REJECTED', actor(REVIEWER, 'ADMIN_APPROVER'), {
            reviewerIdentityId: REVIEWER,
            reasonReference: 'rej:prohibited-item',
          }),
        ),
      ).toThrow('PRODUCT_SOD_VIOLATION');
    });

    it('requires a rejection reason (fail closed)', () => {
      expect(() =>
        lifecycle.transition(
          command(product('CORRECTIONS_REQUESTED'), 'REJECTED', actor(APPROVER, 'ADMIN_APPROVER')),
        ),
      ).toThrow('PRODUCT_REASON_REQUIRED');
    });
  });

  describe('General fail-closed behavior', () => {
    it('rejects same-state transitions', () => {
      expect(() =>
        lifecycle.transition(command(product('DRAFT'), 'DRAFT', actor(OWNER, 'SELLER_OWNER'))),
      ).toThrow('PRODUCT_STATE_CONFLICT');
    });

    it('rejects transitions from terminal states (REJECTED, CLOSED)', () => {
      for (const terminal of ['REJECTED', 'CLOSED'] as const) {
        expect(() =>
          lifecycle.transition(
            command(product(terminal), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER'), {
              submissionComplete: true,
            }),
          ),
        ).toThrow('PRODUCT_STATE_CONFLICT');
      }
    });

    it('rejects transitions that skip required intermediate states', () => {
      expect(() =>
        lifecycle.transition(
          command(product('DRAFT'), 'PUBLISHED', actor(ADMIN, 'SYSTEM'), {
            submissionComplete: true,
            publicationGranted: true,
          }),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
      expect(() =>
        lifecycle.transition(
          command(product('SUBMITTED'), 'APPROVED', actor(APPROVER, 'ADMIN_APPROVER'), {
            reviewerIdentityId: REVIEWER,
          }),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });

    it('rejects transitions by an unknown actor kind (no silent permissiveness)', () => {
      expect(() =>
        lifecycle.transition(
          command(product('SUBMITTED'), 'UNDER_REVIEW', actor(REVIEWER, 'BOGUS' as never)),
        ),
      ).toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });

    it('canTransition returns false instead of throwing for denied transitions', () => {
      expect(
        lifecycle.canTransition(
          command(product('DRAFT'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER')),
        ),
      ).toBe(false);
      expect(
        lifecycle.canTransition(
          command(product('DRAFT'), 'SUBMITTED', actor(OWNER, 'SELLER_OWNER'), {
            submissionComplete: true,
          }),
        ),
      ).toBe(true);
    });
  });

  describe('updatedProduct (version-guarded state application)', () => {
    it('advances the aggregate version and lifecycle timestamps', () => {
      const submitted = lifecycle.updatedProduct(product('DRAFT'), 'SUBMITTED', NOW);
      expect(submitted.properties.state).toBe('SUBMITTED');
      expect(submitted.properties.aggregateVersion.value).toBe(2);
      expect(submitted.properties.submittedAt).toEqual(NOW);

      const approved = lifecycle.updatedProduct(product('UNDER_REVIEW', 3), 'APPROVED', NOW);
      expect(approved.properties.state).toBe('APPROVED');
      expect(approved.properties.approvedAt).toEqual(NOW);
      expect(approved.properties.aggregateVersion.value).toBe(4);

      const published = lifecycle.updatedProduct(product('APPROVED', 2), 'PUBLISHED', NOW);
      expect(published.properties.state).toBe('PUBLISHED');
      expect(published.properties.publishedAt).toEqual(NOW);

      const closed = lifecycle.updatedProduct(product('PUBLISHED', 2), 'CLOSED', NOW);
      expect(closed.properties.state).toBe('CLOSED');
      expect(closed.properties.closedAt).toEqual(NOW);
    });
  });

  describe('assertCanUpdate (definition edits never change lifecycle state)', () => {
    it('permits edits in DRAFT, CORRECTIONS_REQUESTED and UNPUBLISHED', () => {
      for (const state of ['DRAFT', 'CORRECTIONS_REQUESTED', 'UNPUBLISHED'] as const) {
        expect(() => {
          lifecycle.assertCanUpdate(state);
        }).not.toThrow();
      }
    });

    it('denies edits while locked for review, in approval, or terminal', () => {
      for (const state of [
        'SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
        'PUBLISHED',
        'REJECTED',
        'CLOSED',
      ] as const) {
        expect(() => {
          lifecycle.assertCanUpdate(state);
        }).toThrow('PRODUCT_UPDATE_FORBIDDEN');
      }
    });
  });

  describe('transition record invariants', () => {
    it('records the actor identity and kind for audit', () => {
      const result = lifecycle.transition(
        command(product('PUBLISHED'), 'UNPUBLISHED', actor(OWNER, 'SELLER_OWNER'), {
          reasonReference: 'wdr:reason',
          transitionId: TRANSITION_ID,
        }),
      );
      expect(result.properties.actorIdentityId.value).toBe(OWNER.value);
      expect(result.properties.actorKind).toBe('SELLER_OWNER');
      expect(result.properties.reasonReference).toBe('wdr:reason');
      expect(result.properties.productStateTransitionId.value).toBe(TRANSITION_ID.value);
      expect(result.properties.stateVersion).toBe(2);
    });
  });
});
