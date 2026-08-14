import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import { Product } from '../../domain/entities/product';
import { ProductCategory } from '../../domain/entities/product-category';
import { ProductSku } from '../../domain/entities/product-sku';
import { ProductLifecycle } from '../../domain/lifecycle/product-lifecycle';
import { ProductCatalogPolicy } from '../../domain/policy/product-catalog.policy';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import type { Module02SellerAuthorizationContractPort } from '../../domain/ports/module-02-03-contract.port';
import { Price } from '../../domain/value-objects/price';
import { SkuCode } from '../../domain/value-objects/sku-code';
/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { ProductApplicationService } from './product-application.service';
import type { CreateProductCommand, SubmitProductCommand } from './product-application.service';
import type { SellerAssociationFacts } from '../../domain/ports/module-02-03-contract.port';

const PRODUCT_ID = new UuidV7('01913110-789a-7123-8123-000000000301');
const SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000302');
const CATEGORY_ID = new UuidV7('01913110-789a-7123-8123-000000000303');
const OWNER = new UuidV7('01913110-789a-7123-8123-000000000304');
const MEMBER = new UuidV7('01913110-789a-7123-8123-000000000305');
const NOW = new Date('2026-08-14T00:00:00.000Z');

let idSeed = 0;
const identifiers: UuidV7GenerationPort = {
  next: () => new UuidV7(`01913110-789a-7123-8123-${String(++idSeed).padStart(12, '0')}`),
};
const clock: ClockPort = { now: () => NOW };
const rateLimiter: NonProductionRateLimiterPort = {
  consume: jest.fn().mockResolvedValue({ allowed: true, limit: 10, remaining: 9, resetAt: NOW }),
};

function idempotencyMock(): jest.Mocked<ApiIdempotencyService> {
  return {
    execute: jest.fn(async <T>(execution: { execute: () => Promise<T> }): Promise<T> =>
      execution.execute(),
    ),
  } as unknown as jest.Mocked<ApiIdempotencyService>;
}

function ownerFacts(): SellerAssociationFacts {
  return {
    identityId: OWNER,
    sellerProfileId: SELLER_ID,
    associationRole: 'OWNER',
    associationState: 'ACTIVE',
  };
}

function module02Mock(
  overrides: Partial<Module02SellerAuthorizationContractPort> = {},
): jest.Mocked<Module02SellerAuthorizationContractPort> {
  return {
    resolveActiveAssociation: jest.fn().mockResolvedValue(ownerFacts()),
    isSellerEligibleToList: jest.fn().mockResolvedValue({
      identityId: OWNER,
      eligible: true,
      sellerState: 'ACTIVE',
    }),
    ...overrides,
  } as unknown as jest.Mocked<Module02SellerAuthorizationContractPort>;
}

function repositoryMock(
  overrides: Partial<ProductCatalogRepository> = {},
): jest.Mocked<ProductCatalogRepository> {
  const base: Partial<ProductCatalogRepository> = {
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    findSkus: jest.fn().mockResolvedValue([]),
    findCategory: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  return base as unknown as jest.Mocked<ProductCatalogRepository>;
}

function draftProduct(): Product {
  return new Product({
    productId: PRODUCT_ID,
    sellerProfileId: SELLER_ID,
    categoryId: CATEGORY_ID,
    name: 'Walrus Espresso Machine',
    state: 'DRAFT',
    sellingPrice: new Price(249.99),
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function createCommand(): CreateProductCommand {
  return {
    sellerProfileId: SELLER_ID,
    actorIdentityId: OWNER,
    name: 'Walrus Espresso Machine',
    categoryId: CATEGORY_ID,
    sellingPrice: new Price(249.99),
    skus: [{ skuCode: new SkuCode('WLR-ESPRESSO-001') }],
    requestKey: 'req-001',
  };
}

function submitCommand(version = 1): SubmitProductCommand {
  return {
    productId: PRODUCT_ID,
    actorIdentityId: OWNER,
    expectedVersion: version,
  };
}

function activeSku(): ProductSku {
  return new ProductSku({
    skuId: new UuidV7('01913110-789a-7123-8123-000000000306'),
    sellerProfileId: SELLER_ID,
    productId: PRODUCT_ID,
    skuCode: new SkuCode('WLR-ESPRESSO-001'),
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function unpublishedProduct(): Product {
  return new Product({
    ...draftProduct().properties,
    state: 'UNPUBLISHED',
  });
}

describe('ProductApplicationService (M04-M3, WEMP-M04-PLAN-001)', () => {
  describe('createProduct', () => {
    it('creates a DRAFT product with SKU and initial transition for the OWNER', async () => {
      const repository = repositoryMock();
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      const result = await service.createProduct(createCommand());

      expect(result.state).toBe('DRAFT');
      expect(result.version).toBe(1);
      expect(repository.insert).toHaveBeenCalledTimes(1);
      const changeSet = repository.insert.mock.calls[0]?.[0];
      expect(changeSet?.product.properties.state).toBe('DRAFT');
      expect(changeSet?.skusToAppend).toHaveLength(1);
      expect(changeSet?.skusToAppend[0]?.properties.skuCode.value).toBe('WLR-ESPRESSO-001');
      expect(changeSet?.transitionsToAppend).toHaveLength(1);
      expect(changeSet?.transitionsToAppend[0]?.properties.toState).toBe('DRAFT');
    });

    it('denies a MEMBER association (management is owner-only, D-01)', async () => {
      const repository = repositoryMock();
      const module02 = module02Mock({
        resolveActiveAssociation: jest.fn().mockResolvedValue({
          identityId: MEMBER,
          sellerProfileId: SELLER_ID,
          associationRole: 'MEMBER',
          associationState: 'ACTIVE',
        }),
      });
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(service.createProduct(createCommand())).rejects.toThrow(
        'PRODUCT_OWNERSHIP_DENIED',
      );
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('fails closed when the caller has no association', async () => {
      const repository = repositoryMock();
      const module02 = module02Mock({
        resolveActiveAssociation: jest.fn().mockResolvedValue(null),
      });
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(service.createProduct(createCommand())).rejects.toThrow(
        'PRODUCT_OWNERSHIP_DENIED',
      );
    });

    it('denies creation when the OWNER of seller A targets seller B (cross-seller isolation, D-01)', async () => {
      const otherSellerId = new UuidV7('01913110-789a-7123-8123-000000000310');
      const repository = repositoryMock();
      // The resolver (server-side) returns facts only for the OWNER's own
      // seller; a product for another seller resolves to no association.
      const module02 = module02Mock({
        resolveActiveAssociation: jest
          .fn()
          .mockImplementation((identityId: UuidV7, sellerProfileId: UuidV7) => {
            void identityId;
            if (sellerProfileId.value === otherSellerId.value) {
              return null;
            }
            return ownerFacts();
          }),
      });
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(
        service.createProduct({ ...createCommand(), sellerProfileId: otherSellerId }),
      ).rejects.toThrow('PRODUCT_OWNERSHIP_DENIED');
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('denies creation when the seller is not APPROVED/ACTIVE (listing gate, §26)', async () => {
      const repository = repositoryMock();
      const module02 = module02Mock({
        isSellerEligibleToList: jest.fn().mockResolvedValue({
          identityId: OWNER,
          eligible: false,
          sellerState: 'SUSPENDED',
        }),
      });
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(service.createProduct(createCommand())).rejects.toThrow(
        'PRODUCT_OWNERSHIP_DENIED',
      );
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('fails closed when the rate limiter denies the request', async () => {
      const repository = repositoryMock();
      const module02 = module02Mock();
      const deniedRateLimiter: NonProductionRateLimiterPort = {
        consume: jest.fn().mockResolvedValue({
          allowed: false,
          limit: 10,
          remaining: 0,
          resetAt: NOW,
        }),
      };
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        deniedRateLimiter,
      );

      await expect(service.createProduct(createCommand())).rejects.toThrow(
        'PRODUCT_PRECONDITION_FAILED',
      );
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('rejects duplicate SKU codes within the same request (D-06)', async () => {
      const repository = repositoryMock();
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );
      const command = {
        ...createCommand(),
        skus: [{ skuCode: new SkuCode('WLR-001') }, { skuCode: new SkuCode('WLR-001') }],
      };

      await expect(service.createProduct(command)).rejects.toThrow('PRODUCT_SKU_CONFLICT');
      expect(repository.insert).not.toHaveBeenCalled();
    });
  });

  describe('submitProduct', () => {
    it('submits a complete DRAFT product (precondition satisfied)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
        findCategory: jest.fn().mockResolvedValue(
          new ProductCategory({
            categoryId: CATEGORY_ID,
            name: 'Home Appliances',
            state: 'ACTIVE',
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
        ),
        findSkus: jest.fn().mockResolvedValue([activeSku()]),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      const result = await service.submitProduct(submitCommand());

      expect(result.state).toBe('SUBMITTED');
      expect(result.version).toBe(2);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.transitionsToAppend[0]?.properties.toState).toBe('SUBMITTED');
    });

    it('fails closed when submission is incomplete (no SKU)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
        findSkus: jest.fn().mockResolvedValue([]),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(service.submitProduct(submitCommand())).rejects.toThrow(
        'PRODUCT_PRECONDITION_FAILED',
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a stale version (optimistic concurrency)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(service.submitProduct(submitCommand(5))).rejects.toThrow(
        'PRODUCT_STATE_CONFLICT',
      );
    });

    it('denies submission from a non-DRAFT state (fail closed)', async () => {
      const submitted = new Product({
        ...draftProduct().properties,
        state: 'SUBMITTED',
        submittedAt: NOW,
      });
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(submitted) });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(service.submitProduct(submitCommand(1))).rejects.toThrow(
        'PRODUCT_STATE_CONFLICT',
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies a non-owner actor from submitting', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
      });
      const module02 = {
        resolveActiveAssociation: jest.fn().mockResolvedValue({
          identityId: MEMBER,
          sellerProfileId: SELLER_ID,
          associationRole: 'MEMBER',
          associationState: 'ACTIVE',
        }),
      };
      const service = new ProductApplicationService(
        repository,
        module02 as unknown as Module02SellerAuthorizationContractPort,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(
        service.submitProduct({ ...submitCommand(), actorIdentityId: MEMBER }),
      ).rejects.toThrow('PRODUCT_OWNERSHIP_DENIED');
    });
  });

  describe('resubmitProduct', () => {
    it('resubmits a CORRECTIONS_REQUESTED product into a new review cycle', async () => {
      const corrections = new Product({
        ...draftProduct().properties,
        state: 'CORRECTIONS_REQUESTED',
      });
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(corrections),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      const result = await service.resubmitProduct(submitCommand(1));

      expect(result.state).toBe('SUBMITTED');
      expect(result.version).toBe(2);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('PRODUCT_RESUBMITTED');
    });

    it('rejects resubmission from a non-rework state', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(service.resubmitProduct(submitCommand(1))).rejects.toThrow(
        'PRODUCT_STATE_CONFLICT',
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateProduct', () => {
    it('applies a version-guarded definition update without a lifecycle episode', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      const result = await service.updateProduct({
        productId: PRODUCT_ID,
        actorIdentityId: OWNER,
        expectedVersion: 1,
        name: 'Renamed Espresso Machine',
        sellingPrice: new Price(259.99),
      });

      expect(result.state).toBe('DRAFT');
      expect(result.version).toBe(2);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.product.properties.name).toBe('Renamed Espresso Machine');
      expect(changeSet?.product.properties.sellingPrice.value).toBe(259.99);
      expect(changeSet?.transitionsToAppend).toHaveLength(0);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('PRODUCT_UPDATED');
    });

    it('upserts an additional SKU with per-seller uniqueness (D-06)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
        findSkus: jest.fn().mockResolvedValue([activeSku()]),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      const result = await service.updateProduct({
        productId: PRODUCT_ID,
        actorIdentityId: OWNER,
        expectedVersion: 1,
        skusToUpsert: [{ skuCode: new SkuCode('WLR-ESPRESSO-002') }],
      });

      expect(result.version).toBe(2);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.skusToAppend).toHaveLength(1);
      expect(changeSet?.skusToAppend[0]?.properties.skuCode.value).toBe('WLR-ESPRESSO-002');
    });

    it('denies updates while locked for review (SUBMITTED)', async () => {
      const submitted = new Product({
        ...draftProduct().properties,
        state: 'SUBMITTED',
        submittedAt: NOW,
      });
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(submitted) });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(
        service.updateProduct({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          name: 'Renamed',
        }),
      ).rejects.toThrow('PRODUCT_UPDATE_FORBIDDEN');
    });

    it('denies SKU mutation once PUBLISHED (D-02 edit gate, D-06 immutability)', async () => {
      const published = new Product({
        ...draftProduct().properties,
        state: 'PUBLISHED',
        publishedAt: NOW,
      });
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(published),
        findSkus: jest.fn().mockResolvedValue([]),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(
        service.updateProduct({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          skusToUpsert: [{ skuCode: new SkuCode('WLR-NEW-001') }],
        }),
      ).rejects.toThrow('PRODUCT_UPDATE_FORBIDDEN');
    });
  });

  describe('closeProduct', () => {
    it('closes an UNPUBLISHED product with a mandatory reason (D-02)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(unpublishedProduct()),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      const result = await service.closeProduct({
        productId: PRODUCT_ID,
        actorIdentityId: OWNER,
        expectedVersion: 1,
        reasonReference: 'cls:withdrawal',
      });

      expect(result.state).toBe('CLOSED');
      expect(result.version).toBe(2);
    });

    it('denies closure from DRAFT (no DRAFT→CLOSED transition in D-02)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(
        service.closeProduct({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          reasonReference: 'cls:withdrawal',
        }),
      ).rejects.toThrow('PRODUCT_TRANSITION_FORBIDDEN');
    });

    it('fails closed when the product is missing', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(null) });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(
        service.closeProduct({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          reasonReference: 'cls:withdrawal',
        }),
      ).rejects.toThrow('PRODUCT_NOT_FOUND');
    });

    it('denies closure by a non-owner (fail closed)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(unpublishedProduct()),
      });
      const memberModule02 = {
        resolveActiveAssociation: jest.fn().mockResolvedValue({
          identityId: MEMBER,
          sellerProfileId: SELLER_ID,
          associationRole: 'MEMBER',
          associationState: 'ACTIVE',
        }),
      };
      const service = new ProductApplicationService(
        repository,
        memberModule02 as unknown as Module02SellerAuthorizationContractPort,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(
        service.closeProduct({
          productId: PRODUCT_ID,
          actorIdentityId: MEMBER,
          expectedVersion: 1,
          reasonReference: 'cls:withdrawal',
        }),
      ).rejects.toThrow('PRODUCT_OWNERSHIP_DENIED');
    });

    it('requires a closure reason (fail closed)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(unpublishedProduct()),
      });
      const module02 = module02Mock();
      const service = new ProductApplicationService(
        repository,
        module02,
        new ProductLifecycle(),
        new ProductCatalogPolicy(),
        clock,
        identifiers,
        idempotencyMock(),
        rateLimiter,
      );

      await expect(
        service.closeProduct({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          reasonReference: '   ',
        }),
      ).rejects.toThrow('PRODUCT_REASON_REQUIRED');
    });
  });
});
