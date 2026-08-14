import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { OptimisticConcurrencyError } from '../../../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { Product } from '../../../../domain/entities/product';
import { ProductSku } from '../../../../domain/entities/product-sku';
import { ProductStateTransition } from '../../../../domain/entities/product-state-transition';
import type { ProductAggregateChangeSet } from '../../../../domain/ports/product-catalog-repository.port';
import { Price } from '../../../../domain/value-objects/price';
import { SkuCode } from '../../../../domain/value-objects/sku-code';
import { PrismaProductCatalogRepository } from './prisma-product-catalog.repository';

const PRODUCT_ID = new UuidV7('01913110-789a-7123-8123-000000000201');
const SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000202');
const CATEGORY_ID = new UuidV7('01913110-789a-7123-8123-000000000203');
const SKU_ID = new UuidV7('01913110-789a-7123-8123-000000000204');
const TRANSITION_ID = new UuidV7('01913110-789a-7123-8123-000000000205');
const ACTOR = new UuidV7('01913110-789a-7123-8123-000000000206');
const NOW = new Date('2026-08-14T00:00:00.000Z');

const productRow = {
  productId: PRODUCT_ID.value,
  sellerProfileId: SELLER_ID.value,
  categoryId: CATEGORY_ID.value,
  name: 'Walrus Espresso Machine',
  state: 'DRAFT',
  sellingPrice: 249.99,
  compareAtPrice: null,
  aggregateVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  submittedAt: null,
  approvedAt: null,
  publishedAt: null,
  closedAt: null,
  correlationId: null,
};

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

function sku(): ProductSku {
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

function initialTransition(): ProductStateTransition {
  return new ProductStateTransition({
    productStateTransitionId: TRANSITION_ID,
    productId: PRODUCT_ID,
    toState: 'DRAFT',
    stateVersion: 1,
    actorIdentityId: ACTOR,
    actorKind: 'SELLER_OWNER',
    transitionedAt: NOW,
    createdAt: NOW,
  });
}

function changeSet(product: Product = draftProduct()): ProductAggregateChangeSet {
  return {
    product,
    variantsToAppend: [],
    skusToAppend: [sku()],
    mediaToAppend: [],
    attributeValuesToAppend: [],
    transitionsToAppend: [initialTransition()],
    auditRecordsToAppend: [],
    priceHistoryToAppend: [],
  };
}

describe('PrismaProductCatalogRepository (M04 persistence)', () => {
  it('maps a persisted product row back to the domain', async () => {
    const findUnique = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(productRow);
    const prisma = { product: { findUnique } } as unknown as PrismaService;

    const product = await new PrismaProductCatalogRepository(prisma).findById(PRODUCT_ID);

    expect(findUnique).toHaveBeenCalledWith({
      where: { productId: PRODUCT_ID.value },
    });
    expect(product?.properties).toMatchObject({
      productId: PRODUCT_ID,
      state: 'DRAFT',
    });
    expect(product?.properties.sellingPrice.value).toBe(249.99);
  });

  it('returns null when no product exists', async () => {
    const prisma = {
      product: { findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const result = await new PrismaProductCatalogRepository(prisma).findById(PRODUCT_ID);

    expect(result).toBeNull();
  });

  it('maps SKU rows back to the domain with the validated SkuCode', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        skuId: SKU_ID.value,
        sellerProfileId: SELLER_ID.value,
        productId: PRODUCT_ID.value,
        variantId: null,
        skuCode: 'WLR-ESPRESSO-001',
        state: 'ACTIVE',
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        closedAt: null,
      },
    ]);
    const prisma = { productSku: { findMany } } as unknown as PrismaService;

    const skus = await new PrismaProductCatalogRepository(prisma).findSkus(PRODUCT_ID);

    expect(findMany).toHaveBeenCalledWith({
      where: { productId: PRODUCT_ID.value },
      orderBy: { createdAt: 'asc' },
    });
    expect(skus[0]?.properties.skuCode.value).toBe('WLR-ESPRESSO-001');
    expect(skus[0]?.properties.state).toBe('ACTIVE');
  });

  it('maps transitions ordered by state version', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        productStateTransitionId: TRANSITION_ID.value,
        productId: PRODUCT_ID.value,
        fromState: null,
        toState: 'DRAFT',
        stateVersion: 1,
        actorIdentityId: ACTOR.value,
        actorKind: 'SELLER_OWNER',
        reasonReference: null,
        correlationId: null,
        causationId: null,
        sourceReference: null,
        transitionedAt: NOW,
        createdAt: NOW,
      },
    ]);
    const prisma = { productStateTransition: { findMany } } as unknown as PrismaService;

    const transitions = await new PrismaProductCatalogRepository(prisma).findTransitions(
      PRODUCT_ID,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { productId: PRODUCT_ID.value },
      orderBy: { stateVersion: 'asc' },
    });
    expect(transitions[0]?.properties).toMatchObject({
      toState: 'DRAFT',
      stateVersion: 1,
      actorKind: 'SELLER_OWNER',
    });
  });

  it('returns only the seller-scoped products (non-enumerating)', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([productRow]);
    const prisma = { product: { findMany } } as unknown as PrismaService;

    const products = await new PrismaProductCatalogRepository(prisma).findBySeller(SELLER_ID);

    expect(findMany).toHaveBeenCalledWith({
      where: { sellerProfileId: SELLER_ID.value },
      orderBy: { createdAt: 'asc' },
    });
    expect(products).toHaveLength(1);
  });

  it('lists all products for the admin surface with an optional state filter', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([productRow]);
    const prisma = { product: { findMany } } as unknown as PrismaService;
    const repository = new PrismaProductCatalogRepository(prisma);

    const all = await repository.findAll();
    const filtered = await repository.findAll('SUBMITTED');

    expect(findMany).toHaveBeenNthCalledWith(1, { where: {}, orderBy: { createdAt: 'asc' } });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { state: 'SUBMITTED' },
      orderBy: { createdAt: 'asc' },
    });
    expect(all).toHaveLength(1);
    expect(filtered[0]?.properties.state).toBe('DRAFT');
  });

  it('maps a category row and filters to ACTIVE categories', async () => {
    const categoryRow = {
      categoryId: CATEGORY_ID.value,
      name: 'Home Appliances',
      parentCategoryId: null,
      state: 'ACTIVE',
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      retiredAt: null,
    };
    const prisma = {
      productCategory: {
        findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(categoryRow),
        findMany: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([categoryRow]),
      },
    } as unknown as PrismaService;
    const repository = new PrismaProductCatalogRepository(prisma);

    const category = await repository.findCategory(CATEGORY_ID);
    const active = await repository.findActiveCategories();

    expect(category?.properties).toMatchObject({ name: 'Home Appliances', state: 'ACTIVE' });
    expect(active[0]?.properties.state).toBe('ACTIVE');
  });

  it('inserts the product, SKUs and transitions in one transaction', async () => {
    const createProduct = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const createSku = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const createTransition = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const transaction = {
      product: { create: createProduct },
      productVariant: { create: jest.fn() },
      productSku: { create: createSku },
      productMedia: { create: jest.fn() },
      productAttributeValue: { create: jest.fn() },
      productStateTransition: { create: createTransition },
      productAuditRecord: { create: jest.fn() },
      productPriceHistory: { create: jest.fn() },
    };
    const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
      operation(transaction as never),
    );
    const repository = new PrismaProductCatalogRepository({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    await repository.insert(changeSet());

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(createSku).toHaveBeenCalledTimes(1);
    expect(createTransition).toHaveBeenCalledTimes(1);
    const productCreate = createProduct.mock.calls[0]?.[0] as
      { data?: Record<string, unknown> } | undefined;
    expect(productCreate?.data).toMatchObject({
      productId: PRODUCT_ID.value,
      state: 'DRAFT',
      sellingPrice: 249.99,
      aggregateVersion: 1,
    });
  });

  it('rolls back the whole change set when a child insert fails', async () => {
    const failure = new Error('sku write failed');
    const transaction = {
      product: { create: jest.fn().mockResolvedValue(undefined) },
      productVariant: { create: jest.fn() },
      productSku: { create: jest.fn().mockRejectedValue(failure) },
      productMedia: { create: jest.fn() },
      productAttributeValue: { create: jest.fn() },
      productStateTransition: { create: jest.fn() },
      productAuditRecord: { create: jest.fn() },
      productPriceHistory: { create: jest.fn() },
    };
    const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
      operation(transaction as never),
    );
    const repository = new PrismaProductCatalogRepository({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    await expect(repository.insert(changeSet())).rejects.toBe(failure);
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('saves a versioned change set when the expected version is current', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const transaction = {
      product: { updateMany },
      productVariant: { upsert: jest.fn() },
      productSku: { upsert: jest.fn().mockResolvedValue(undefined) },
      productMedia: { upsert: jest.fn() },
      productAttributeValue: { upsert: jest.fn() },
      productStateTransition: { create: jest.fn() },
      productAuditRecord: { create: jest.fn() },
      productPriceHistory: { create: jest.fn() },
    };
    const repository = new PrismaProductCatalogRepository({
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService);

    const submitted = new Product({
      ...draftProduct().properties,
      state: 'SUBMITTED',
      submittedAt: NOW,
      aggregateVersion: new AggregateVersion(2),
      updatedAt: NOW,
    });
    await repository.save(changeSet(submitted), new AggregateVersion(1));

    const update = updateMany.mock.calls[0]?.[0] as
      { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
    expect(update?.where).toMatchObject({
      productId: PRODUCT_ID.value,
      aggregateVersion: 1,
    });
    expect(update?.data).toMatchObject({ state: 'SUBMITTED', aggregateVersion: 2 });
  });

  it('rejects a stale save with OptimisticConcurrencyError and appends nothing', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 0 });
    const createTransition = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      product: { updateMany },
      productVariant: { upsert: jest.fn() },
      productSku: { upsert: jest.fn() },
      productMedia: { upsert: jest.fn() },
      productAttributeValue: { upsert: jest.fn() },
      productStateTransition: { create: createTransition },
      productAuditRecord: { create: jest.fn() },
      productPriceHistory: { create: jest.fn() },
    };
    const repository = new PrismaProductCatalogRepository({
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService);

    await expect(repository.save(changeSet(), new AggregateVersion(1))).rejects.toBeInstanceOf(
      OptimisticConcurrencyError,
    );
    expect(createTransition).not.toHaveBeenCalled();
  });

  it('fails closed when a missing category cannot be resolved', async () => {
    const prisma = {
      productCategory: {
        findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const category = await new PrismaProductCatalogRepository(prisma).findCategory(CATEGORY_ID);

    expect(category).toBeNull();
  });
});

describe('Product domain roundtrip (mapper persistence shape)', () => {
  it('persists the draft product with mapped snake_case fields', async () => {
    const createProduct = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const transaction = {
      product: { create: createProduct },
      productVariant: { create: jest.fn() },
      productSku: { create: jest.fn() },
      productMedia: { create: jest.fn() },
      productAttributeValue: { create: jest.fn() },
      productStateTransition: { create: jest.fn() },
      productAuditRecord: { create: jest.fn() },
      productPriceHistory: { create: jest.fn() },
    };
    const repository = new PrismaProductCatalogRepository({
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService);

    await repository.insert(changeSet());

    const data = createProduct.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
    expect(data?.data).toMatchObject({
      productId: PRODUCT_ID.value,
      sellerProfileId: SELLER_ID.value,
      categoryId: CATEGORY_ID.value,
      state: 'DRAFT',
      aggregateVersion: 1,
    });
    expect(data?.data).not.toHaveProperty('selling_price');
    expect(data?.data).toHaveProperty('sellingPrice', 249.99);
  });
});
