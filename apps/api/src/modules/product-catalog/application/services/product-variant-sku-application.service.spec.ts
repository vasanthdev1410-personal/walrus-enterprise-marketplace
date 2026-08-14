import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import { Product } from '../../domain/entities/product';
import { ProductSku } from '../../domain/entities/product-sku';
import { ProductLifecycle } from '../../domain/lifecycle/product-lifecycle';
import { ProductCatalogPolicy } from '../../domain/policy/product-catalog.policy';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import type { Module02SellerAuthorizationContractPort } from '../../domain/ports/module-02-03-contract.port';
import { Price } from '../../domain/value-objects/price';
import { SkuCode } from '../../domain/value-objects/sku-code';
import type { SellerAssociationFacts } from '../../domain/ports/module-02-03-contract.port';
import { ProductVariantSkuApplicationService } from './product-variant-sku-application.service';

/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */

const PRODUCT_ID = new UuidV7('01913110-789a-7123-8123-000000000501');
const SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000502');
const CATEGORY_ID = new UuidV7('01913110-789a-7123-8123-000000000503');
const OWNER = new UuidV7('01913110-789a-7123-8123-000000000504');
const MEMBER = new UuidV7('01913110-789a-7123-8123-000000000505');
const SKU_ID = new UuidV7('01913110-789a-7123-8123-000000000506');
const NOW = new Date('2026-08-14T00:00:00.000Z');

let idSeed = 0;
const identifiers: UuidV7GenerationPort = {
  next: () => new UuidV7(`01913110-789a-7123-8123-${String(++idSeed).padStart(12, '0')}`),
};
const clock: ClockPort = { now: () => NOW };

function ownerFacts(): SellerAssociationFacts {
  return {
    identityId: OWNER,
    sellerProfileId: SELLER_ID,
    associationRole: 'OWNER',
    associationState: 'ACTIVE',
  };
}

function repositoryMock(
  overrides: Partial<ProductCatalogRepository> = {},
): jest.Mocked<ProductCatalogRepository> {
  const base: Partial<ProductCatalogRepository> = {
    save: jest.fn().mockResolvedValue(undefined),
    findSkus: jest.fn().mockResolvedValue([]),
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

function publishedProduct(): Product {
  return new Product({
    ...draftProduct().properties,
    state: 'PUBLISHED',
    publishedAt: NOW,
  });
}

function activeSku(): ProductSku {
  return new ProductSku({
    skuId: SKU_ID,
    sellerProfileId: SELLER_ID,
    productId: PRODUCT_ID,
    skuCode: new SkuCode('WLR-ESPRESSO-001'),
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function service(
  repository: ProductCatalogRepository,
  module02: Partial<Module02SellerAuthorizationContractPort> = {
    resolveActiveAssociation: jest.fn().mockResolvedValue(ownerFacts()),
  },
): ProductVariantSkuApplicationService {
  return new ProductVariantSkuApplicationService(
    repository,
    module02 as unknown as Module02SellerAuthorizationContractPort,
    new ProductLifecycle(),
    new ProductCatalogPolicy(),
    clock,
    identifiers,
  );
}

describe('ProductVariantSkuApplicationService (M04-M3, WEMP-M04-PLAN-001)', () => {
  describe('addVariant', () => {
    it('adds a single-level variant with its own SKU (D-05)', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(draftProduct()) });
      const variantService = service(repository);

      const result = await variantService.addVariant({
        productId: PRODUCT_ID,
        actorIdentityId: OWNER,
        expectedVersion: 1,
        name: 'Stainless Steel',
        sellingPrice: new Price(299.99),
        skuCode: new SkuCode('WLR-ESPRESSO-SS'),
      });

      expect(result.skuCode).toBe('WLR-ESPRESSO-SS');
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.variantsToAppend).toHaveLength(1);
      expect(changeSet?.skusToAppend).toHaveLength(1);
      expect(changeSet?.variantsToAppend[0]?.properties.name).toBe('Stainless Steel');
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'PRODUCT_VARIANT_ADDED',
      );
    });

    it('denies a MEMBER association (management is owner-only, D-01)', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(draftProduct()) });
      const memberModule02 = {
        resolveActiveAssociation: jest.fn().mockResolvedValue({
          identityId: MEMBER,
          sellerProfileId: SELLER_ID,
          associationRole: 'MEMBER',
          associationState: 'ACTIVE',
        }),
      };
      const variantService = service(repository, memberModule02);

      await expect(
        variantService.addVariant({
          productId: PRODUCT_ID,
          actorIdentityId: MEMBER,
          expectedVersion: 1,
          name: 'Stainless Steel',
          sellingPrice: new Price(299.99),
          skuCode: new SkuCode('WLR-ESPRESSO-SS'),
        }),
      ).rejects.toThrow('PRODUCT_OWNERSHIP_DENIED');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies variant edits on a PUBLISHED product (re-moderation required)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(publishedProduct()),
      });
      const variantService = service(repository);

      await expect(
        variantService.addVariant({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          name: 'Stainless Steel',
          sellingPrice: new Price(299.99),
          skuCode: new SkuCode('WLR-ESPRESSO-SS'),
        }),
      ).rejects.toThrow('PRODUCT_UPDATE_FORBIDDEN');
    });

    it('rejects a stale product version (optimistic concurrency)', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(draftProduct()) });
      const variantService = service(repository);

      await expect(
        variantService.addVariant({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 9,
          name: 'Stainless Steel',
          sellingPrice: new Price(299.99),
          skuCode: new SkuCode('WLR-ESPRESSO-SS'),
        }),
      ).rejects.toThrow('PRODUCT_STATE_CONFLICT');
    });
  });

  describe('addSku', () => {
    it('adds an ACTIVE SKU to a product', async () => {
      const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(draftProduct()) });
      const variantService = service(repository);

      const result = await variantService.addSku({
        productId: PRODUCT_ID,
        actorIdentityId: OWNER,
        expectedVersion: 1,
        skuCode: new SkuCode('WLR-ESPRESSO-002'),
      });

      expect(result.skuCode).toBe('WLR-ESPRESSO-002');
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.skusToAppend).toHaveLength(1);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('PRODUCT_SKU_ADDED');
    });

    it('rejects a duplicate SKU code within the seller scope (D-06)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
        findSkus: jest.fn().mockResolvedValue([activeSku()]),
      });
      const variantService = service(repository);

      await expect(
        variantService.addSku({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          skuCode: new SkuCode('WLR-ESPRESSO-001'),
        }),
      ).rejects.toThrow('PRODUCT_SKU_CONFLICT');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies SKU addition once PUBLISHED (re-moderation required, D-06)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(publishedProduct()),
      });
      const variantService = service(repository);

      await expect(
        variantService.addSku({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          skuCode: new SkuCode('WLR-ESPRESSO-002'),
        }),
      ).rejects.toThrow('PRODUCT_UPDATE_FORBIDDEN');
    });
  });

  describe('closeSku', () => {
    it('closes an ACTIVE SKU with a closedAt timestamp (append-only)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
        findSkus: jest.fn().mockResolvedValue([activeSku()]),
      });
      const variantService = service(repository);

      const result = await variantService.closeSku({
        productId: PRODUCT_ID,
        actorIdentityId: OWNER,
        expectedVersion: 1,
        skuId: SKU_ID,
      });

      expect(result.skuId).toBe(SKU_ID.value);
      const changeSet = repository.save.mock.calls[0]?.[0];
      const closed = changeSet?.skusToAppend[0];
      expect(closed?.properties.state).toBe('CLOSED');
      expect(closed?.properties.closedAt).toEqual(NOW);
      expect(closed?.properties.aggregateVersion.value).toBe(2);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('PRODUCT_SKU_CLOSED');
    });

    it('fails closed when the SKU is not ACTIVE or not found', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(draftProduct()),
        findSkus: jest.fn().mockResolvedValue([]),
      });
      const variantService = service(repository);

      await expect(
        variantService.closeSku({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          skuId: SKU_ID,
        }),
      ).rejects.toThrow('PRODUCT_NOT_FOUND');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies SKU closure once PUBLISHED (D-06 immutability)', async () => {
      const repository = repositoryMock({
        findById: jest.fn().mockResolvedValue(publishedProduct()),
        findSkus: jest.fn().mockResolvedValue([activeSku()]),
      });
      const variantService = service(repository);

      await expect(
        variantService.closeSku({
          productId: PRODUCT_ID,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          skuId: SKU_ID,
        }),
      ).rejects.toThrow('PRODUCT_SKU_IMMUTABLE');
    });
  });
});
