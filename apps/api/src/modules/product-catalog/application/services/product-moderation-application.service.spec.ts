import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import { Product } from '../../domain/entities/product';
import { ProductStateTransition } from '../../domain/entities/product-state-transition';
import { ProductLifecycle } from '../../domain/lifecycle/product-lifecycle';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import { Price } from '../../domain/value-objects/price';
import type { ProductAdminAuthorizationPort } from '../ports/product-admin-authorization.port';
import type { ProductState } from '../../domain/value-objects/product-state';
import {
  ProductModerationApplicationService,
  type ModerationCommand,
} from './product-moderation-application.service';

/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */

const PRODUCT_ID = new UuidV7('01913110-789a-7123-8123-000000000401');
const SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000402');
const CATEGORY_ID = new UuidV7('01913110-789a-7123-8123-000000000403');
const REVIEWER = new UuidV7('01913110-789a-7123-8123-000000000404');
const APPROVER = new UuidV7('01913110-789a-7123-8123-000000000405');
const NOW = new Date('2026-08-14T00:00:00.000Z');

let idSeed = 0;
const identifiers: UuidV7GenerationPort = {
  next: () => new UuidV7(`01913110-789a-7123-8123-${String(++idSeed).padStart(12, '0')}`),
};
const clock: ClockPort = { now: () => NOW };

function adminAuthMock(granted = true): jest.Mocked<ProductAdminAuthorizationPort> {
  return {
    isGranted: jest.fn().mockResolvedValue(granted),
  };
}

function repositoryMock(
  overrides: Partial<ProductCatalogRepository> = {},
): jest.Mocked<ProductCatalogRepository> {
  const base: Partial<ProductCatalogRepository> = {
    save: jest.fn().mockResolvedValue(undefined),
    findTransitions: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return base as unknown as jest.Mocked<ProductCatalogRepository>;
}

function productIn(state: ProductState, version: number): Product {
  return new Product({
    productId: PRODUCT_ID,
    sellerProfileId: SELLER_ID,
    categoryId: CATEGORY_ID,
    name: 'Walrus Espresso Machine',
    state,
    sellingPrice: new Price(249.99),
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
    submittedAt: NOW,
  });
}

function claimEpisode(): ProductStateTransition {
  return new ProductStateTransition({
    productStateTransitionId: new UuidV7('01913110-789a-7123-8123-000000000406'),
    productId: PRODUCT_ID,
    fromState: 'SUBMITTED',
    toState: 'UNDER_REVIEW',
    stateVersion: 2,
    actorIdentityId: REVIEWER,
    actorKind: 'ADMIN_REVIEWER',
    transitionedAt: NOW,
    createdAt: NOW,
  });
}

function moderationCommand(actor: UuidV7, version: number): ModerationCommand {
  return { productId: PRODUCT_ID, actorIdentityId: actor, expectedVersion: version };
}

function service(
  repository: ProductCatalogRepository,
  adminAuth: ProductAdminAuthorizationPort = adminAuthMock(),
): ProductModerationApplicationService {
  return new ProductModerationApplicationService(
    repository,
    adminAuth,
    new ProductLifecycle(),
    clock,
    identifiers,
  );
}

describe('ProductModerationApplicationService (M04-M3, WEMP-M04-PLAN-001)', () => {
  describe('claimReview', () => {
    it('claims a SUBMITTED product into UNDER_REVIEW as the admin reviewer', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('SUBMITTED', 1)),
      });
      const moderation = service(repository);

      const result = await moderation.claimReview(moderationCommand(REVIEWER, 1));

      expect(result.state).toBe('UNDER_REVIEW');
      expect(result.version).toBe(2);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.transitionsToAppend).toHaveLength(1);
      expect(changeSet?.transitionsToAppend[0]?.properties.toState).toBe('UNDER_REVIEW');
      expect(changeSet?.transitionsToAppend[0]?.properties.actorKind).toBe('ADMIN_REVIEWER');
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'PRODUCT_REVIEW_CLAIMED',
      );
    });

    it('denies an admin without product.review.decide (fail closed)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('SUBMITTED', 1)),
      });
      const moderation = service(repository, adminAuthMock(false));

      await expect(moderation.claimReview(moderationCommand(REVIEWER, 1))).rejects.toThrow(
        'PRODUCT_ADMIN_AUTHORIZATION_DENIED',
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a stale version (optimistic concurrency)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('SUBMITTED', 1)),
      });
      const moderation = service(repository);

      await expect(moderation.claimReview(moderationCommand(REVIEWER, 7))).rejects.toThrow(
        'PRODUCT_STATE_CONFLICT',
      );
    });

    it('fails closed when the product is missing', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(null) });
      const moderation = service(repository);

      await expect(moderation.claimReview(moderationCommand(REVIEWER, 1))).rejects.toThrow(
        'PRODUCT_NOT_FOUND',
      );
    });
  });

  describe('requestCorrections', () => {
    it('moves an UNDER_REVIEW product to CORRECTIONS_REQUESTED with a reason', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('UNDER_REVIEW', 2)),
      });
      const moderation = service(repository);

      const result = await moderation.requestCorrections({
        ...moderationCommand(REVIEWER, 2),
        reasonReference: 'fix:image-too-small',
      });

      expect(result.state).toBe('CORRECTIONS_REQUESTED');
      expect(result.version).toBe(3);
    });

    it('requires a corrections reason (fail closed)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('UNDER_REVIEW', 2)),
      });
      const moderation = service(repository);

      await expect(
        moderation.requestCorrections({
          ...moderationCommand(REVIEWER, 2),
          reasonReference: '   ',
        }),
      ).rejects.toThrow('PRODUCT_REASON_REQUIRED');
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('decideApproval', () => {
    it('approves when the approver is distinct from the reviewer (SoD, D-10)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('UNDER_REVIEW', 2)),
        findTransitions: jest.fn().mockResolvedValue([claimEpisode()]),
      });
      const moderation = service(repository);

      const result = await moderation.decideApproval(moderationCommand(APPROVER, 2));

      expect(result.state).toBe('APPROVED');
      expect(result.version).toBe(3);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.transitionsToAppend[0]?.properties.actorKind).toBe('ADMIN_APPROVER');
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('PRODUCT_APPROVED');
    });

    it('denies the reviewer approving their own claim (SoD violation)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('UNDER_REVIEW', 2)),
        findTransitions: jest.fn().mockResolvedValue([claimEpisode()]),
      });
      const moderation = service(repository);

      await expect(moderation.decideApproval(moderationCommand(REVIEWER, 2))).rejects.toThrow(
        'PRODUCT_SOD_VIOLATION',
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('fails closed when the product is missing', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(null) });
      const moderation = service(repository);

      await expect(moderation.decideApproval(moderationCommand(APPROVER, 2))).rejects.toThrow(
        'PRODUCT_NOT_FOUND',
      );
    });

    it('fails closed when the reviewer cannot be resolved from the transition log', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('UNDER_REVIEW', 2)),
        findTransitions: jest.fn().mockResolvedValue([]),
      });
      const moderation = service(repository);

      await expect(moderation.decideApproval(moderationCommand(APPROVER, 2))).rejects.toThrow(
        'PRODUCT_REVIEWER_UNRESOLVED',
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('decideRejection', () => {
    it('rejects an UNDER_REVIEW product with a mandatory reason', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('UNDER_REVIEW', 2)),
        findTransitions: jest.fn().mockResolvedValue([claimEpisode()]),
      });
      const moderation = service(repository);

      const result = await moderation.decideRejection({
        ...moderationCommand(APPROVER, 2),
        reasonReference: 'reject:policy-violation',
      });

      expect(result.state).toBe('REJECTED');
      expect(result.version).toBe(3);
    });

    it('requires a rejection reason (fail closed)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('UNDER_REVIEW', 2)),
        findTransitions: jest.fn().mockResolvedValue([claimEpisode()]),
      });
      const moderation = service(repository);

      await expect(
        moderation.decideRejection({
          ...moderationCommand(APPROVER, 2),
          reasonReference: ' ',
        }),
      ).rejects.toThrow('PRODUCT_REASON_REQUIRED');
    });

    it('fails closed when the product is missing', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(null) });
      const moderation = service(repository);

      await expect(
        moderation.decideRejection({
          ...moderationCommand(APPROVER, 2),
          reasonReference: 'reject:policy-violation',
        }),
      ).rejects.toThrow('PRODUCT_NOT_FOUND');
    });
  });

  describe('publishApproved', () => {
    it('publishes an APPROVED product through the SYSTEM gate (D-12)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('APPROVED', 3)),
      });
      const moderation = service(repository);

      const result = await moderation.publishApproved(moderationCommand(APPROVER, 3));

      expect(result.state).toBe('PUBLISHED');
      expect(result.version).toBe(4);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.transitionsToAppend[0]?.properties.actorKind).toBe('SYSTEM');
      expect(changeSet?.transitionsToAppend[0]?.properties.toState).toBe('PUBLISHED');
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('PRODUCT_PUBLISHED');
    });

    it('denies publication without product.review.decide (fail closed)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(productIn('APPROVED', 3)),
      });
      const moderation = service(repository, adminAuthMock(false));

      await expect(moderation.publishApproved(moderationCommand(APPROVER, 3))).rejects.toThrow(
        'PRODUCT_ADMIN_AUTHORIZATION_DENIED',
      );
    });

    it('fails closed when the product is missing', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(null) });
      const moderation = service(repository);

      await expect(moderation.publishApproved(moderationCommand(APPROVER, 3))).rejects.toThrow(
        'PRODUCT_NOT_FOUND',
      );
    });
  });
});
