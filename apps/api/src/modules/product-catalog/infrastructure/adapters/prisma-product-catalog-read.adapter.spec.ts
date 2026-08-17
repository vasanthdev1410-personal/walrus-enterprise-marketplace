/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Product } from '../../domain/entities/product';
import { ProductSku } from '../../domain/entities/product-sku';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import { Price } from '../../domain/value-objects/price';
import { SkuCode } from '../../domain/value-objects/sku-code';
import { PrismaProductCatalogReadAdapter } from './prisma-product-catalog-read.adapter';

const PRODUCT_ID = new UuidV7('01913110-789a-7123-8123-000000000301');
const SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000302');
const CATEGORY_ID = new UuidV7('01913110-789a-7123-8123-000000000303');
const SKU_ID = new UuidV7('01913110-789a-7123-8123-000000000304');
const NOW = new Date('2026-08-14T00:00:00.000Z');

function product(state: 'PUBLISHED' | 'DRAFT' | 'CLOSED'): Product {
  return new Product({
    productId: PRODUCT_ID,
    sellerProfileId: SELLER_ID,
    categoryId: CATEGORY_ID,
    name: 'Walrus Espresso Machine',
    state,
    sellingPrice: new Price(249.99),
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function sku(state: 'ACTIVE' | 'CLOSED'): ProductSku {
  return new ProductSku({
    skuId: SKU_ID,
    sellerProfileId: SELLER_ID,
    productId: PRODUCT_ID,
    skuCode: new SkuCode('WLR-ESPRESSO-001'),
    state,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
    ...(state === 'CLOSED' ? { closedAt: NOW } : {}),
  });
}

function repositoryMock(
  overrides: Partial<ProductCatalogRepository>,
): jest.Mocked<ProductCatalogRepository> {
  return {
    findById: jest.fn(),
    findSkus: jest.fn(),
    findSkuById: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ProductCatalogRepository>;
}

describe('PrismaProductCatalogReadAdapter (M04-M4, WEMP-M04-CONTRACT-001 Part B / D-10)', () => {
  it('returns consumable product facts only for PUBLISHED products with a sellable SKU', async () => {
    const repository = repositoryMock({
      findById: jest.fn().mockResolvedValue(product('PUBLISHED')),
      findSkus: jest.fn().mockResolvedValue([sku('ACTIVE')]),
    });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    await expect(adapter.getConsumableProductFacts(PRODUCT_ID)).resolves.toEqual({
      productId: PRODUCT_ID,
      sellerProfileId: SELLER_ID,
      skuId: SKU_ID,
      skuCode: 'WLR-ESPRESSO-001',
      sellingPrice: 249.99,
    });
  });

  it('prefers an ACTIVE SKU when the product has several', async () => {
    const closed = new ProductSku({
      skuId: new UuidV7('01913110-789a-7123-8123-000000000305'),
      sellerProfileId: SELLER_ID,
      productId: PRODUCT_ID,
      skuCode: new SkuCode('WLR-ESPRESSO-002'),
      state: 'CLOSED',
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
      closedAt: NOW,
    });
    const repository = repositoryMock({
      findById: jest.fn().mockResolvedValue(product('PUBLISHED')),
      findSkus: jest.fn().mockResolvedValue([closed, sku('ACTIVE')]),
    });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    const facts = await adapter.getConsumableProductFacts(PRODUCT_ID);
    expect(facts?.skuId).toEqual(SKU_ID);
  });

  it('returns null for a non-PUBLISHED product (fail closed, D-12)', async () => {
    const repository = repositoryMock({
      findById: jest.fn().mockResolvedValue(product('DRAFT')),
    });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    await expect(adapter.getConsumableProductFacts(PRODUCT_ID)).resolves.toBeNull();
    expect(repository.findSkus).not.toHaveBeenCalled();
  });

  it('returns null for an unknown product (fail closed)', async () => {
    const repository = repositoryMock({ findById: jest.fn().mockResolvedValue(null) });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    await expect(adapter.getConsumableProductFacts(PRODUCT_ID)).resolves.toBeNull();
  });

  it('returns null for a PUBLISHED product without any SKU (fail closed)', async () => {
    const repository = repositoryMock({
      findById: jest.fn().mockResolvedValue(product('PUBLISHED')),
      findSkus: jest.fn().mockResolvedValue([]),
    });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    await expect(adapter.getConsumableProductFacts(PRODUCT_ID)).resolves.toBeNull();
  });

  it('returns SKU facts for an ACTIVE SKU of a PUBLISHED product', async () => {
    const repository = repositoryMock({
      findSkuById: jest.fn().mockResolvedValue(sku('ACTIVE')),
      findById: jest.fn().mockResolvedValue(product('PUBLISHED')),
    });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    await expect(adapter.getConsumableSkuFacts(SKU_ID)).resolves.toEqual({
      skuId: SKU_ID,
      sellerProfileId: SELLER_ID,
      skuCode: 'WLR-ESPRESSO-001',
      state: 'ACTIVE',
    });
  });

  it('carries the CLOSED SKU lifecycle state for D-15 read-only pools', async () => {
    const repository = repositoryMock({
      findSkuById: jest.fn().mockResolvedValue(sku('CLOSED')),
      findById: jest.fn().mockResolvedValue(product('PUBLISHED')),
    });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    const facts = await adapter.getConsumableSkuFacts(SKU_ID);
    expect(facts?.state).toBe('CLOSED');
  });

  it('returns null for an unknown SKU (fail closed)', async () => {
    const repository = repositoryMock({ findSkuById: jest.fn().mockResolvedValue(null) });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    await expect(adapter.getConsumableSkuFacts(SKU_ID)).resolves.toBeNull();
  });

  it('returns null for a SKU whose product is not PUBLISHED (D-12 visibility gate)', async () => {
    const repository = repositoryMock({
      findSkuById: jest.fn().mockResolvedValue(sku('ACTIVE')),
      findById: jest.fn().mockResolvedValue(product('DRAFT')),
    });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    await expect(adapter.getConsumableSkuFacts(SKU_ID)).resolves.toBeNull();
  });

  it('fails closed to null when the repository raises (never a fabricated fact)', async () => {
    const repository = repositoryMock({
      findSkuById: jest.fn().mockRejectedValue(new Error('storage unavailable')),
    });
    const adapter = new PrismaProductCatalogReadAdapter(repository);

    await expect(adapter.getConsumableSkuFacts(SKU_ID)).resolves.toBeNull();
    await expect(adapter.getConsumableProductFacts(PRODUCT_ID)).resolves.toBeNull();
  });
});
