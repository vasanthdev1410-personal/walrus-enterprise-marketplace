import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { Product } from '../entities/product';
import type { ProductAttributeDefinition } from '../entities/product-attribute-definition';
import type { ProductAttributeValue } from '../entities/product-attribute-value';
import type { ProductAuditRecord } from '../entities/product-audit-record';
import type { ProductCategory } from '../entities/product-category';
import type { ProductMedia } from '../entities/product-media';
import type { ProductSku } from '../entities/product-sku';
import type { ProductStateTransition } from '../entities/product-state-transition';
import type { ProductVariant } from '../entities/product-variant';
import type { ProductState } from '../value-objects/product-state';

/**
 * WEMP-M04-PLAN-001 M04-M2. Module 04-owned product-catalog aggregate
 * repository. All mutations are atomic change sets guarded by the aggregate
 * version; a stale version throws an optimistic-concurrency error without
 * mutating any state. Cross-module references (sellerProfileId) are logical
 * UUIDv7 values — the repository never reads Module 01/02/03 storage.
 */
export interface ProductCatalogRepository {
  findById(productId: UuidV7): Promise<Product | null>;
  findVariants(productId: UuidV7): Promise<readonly ProductVariant[]>;
  findSkus(productId: UuidV7): Promise<readonly ProductSku[]>;
  findMedia(productId: UuidV7): Promise<readonly ProductMedia[]>;
  findAttributeValues(productId: UuidV7): Promise<readonly ProductAttributeValue[]>;
  findTransitions(productId: UuidV7): Promise<readonly ProductStateTransition[]>;
  findAuditRecords(productId: UuidV7): Promise<readonly ProductAuditRecord[]>;
  /**
   * WEMP-M04-SPEC-001 §10 (decision D-07). Versioned/audited price history
   * rows in recorded order (most recent last). Price facts only — never
   * computed fees, taxes, or commission.
   */
  findPriceHistory(productId: UuidV7): Promise<readonly ProductPriceHistoryRow[]>;
  /**
   * WEMP-M04-SPEC-001 §16. Lists only the caller's seller-scoped products
   * (non-enumerating); never another seller's products.
   */
  findBySeller(sellerProfileId: UuidV7): Promise<readonly Product[]>;
  /**
   * WEMP-M04-SPEC-001 §18 (M04-M5). Non-enumerating platform-wide product
   * list for the admin surface (product.audit.view), with an optional
   * lifecycle state filter. Never returns evidence or policy internals.
   */
  findAll(state?: ProductState): Promise<readonly Product[]>;
  findCategory(categoryId: UuidV7): Promise<ProductCategory | null>;
  findActiveCategories(): Promise<readonly ProductCategory[]>;
  findAttributeDefinition(attributeId: UuidV7): Promise<ProductAttributeDefinition | null>;
  findActiveAttributeDefinitions(): Promise<readonly ProductAttributeDefinition[]>;
  insert(changeSet: ProductAggregateChangeSet): Promise<void>;
  save(changeSet: ProductAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
}

/**
 * Row type for the Module 04-owned product price history table (D-07). The
 * price fields are opaque persistence facts (Prisma Decimal at the adapter
 * layer); consumers convert to Price value objects at the domain boundary.
 * Price facts only — never computed fees, taxes, or commission.
 */
export interface ProductPriceHistoryRow {
  readonly priceHistoryId: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly sellingPrice: unknown;
  readonly compareAtPrice: unknown;
  readonly recordedVersion: number;
  readonly recordedByIdentityId: string;
  readonly recordedAt: Date;
  readonly createdAt: Date;
}

export interface ProductAggregateChangeSet {
  readonly product: Product;
  readonly variantsToAppend: readonly ProductVariant[];
  readonly skusToAppend: readonly ProductSku[];
  readonly mediaToAppend: readonly ProductMedia[];
  readonly attributeValuesToAppend: readonly ProductAttributeValue[];
  readonly transitionsToAppend: readonly ProductStateTransition[];
  /**
   * WEMP-M04-SPEC-001 §10 (decision D-07). Append-only price history rows
   * committed atomically with the price mutation that caused them.
   */
  readonly priceHistoryToAppend: readonly ProductPriceHistoryRow[];
  /**
   * WEMP-M04-SPEC-001 §24. Append-only Module 04 business audit events
   * committed atomically with the mutation that caused them.
   */
  readonly auditRecordsToAppend: readonly ProductAuditRecord[];
}
