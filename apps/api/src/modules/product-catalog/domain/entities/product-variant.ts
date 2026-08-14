import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { Price } from '../value-objects/price';
import type { ProductState } from '../value-objects/product-state';

/**
 * WEMP-M04-SPEC-001 §8/§17 (decision D-05). Structured, single-level sellable
 * child of a product (no variant-of-variant nesting in Phase 1). Each variant
 * carries its own SKU (D-06), pricing data (D-07), media references, and
 * lifecycle state; publication is gated on the parent product's approval
 * state. productId is a logical reference within Module 04 storage.
 */
export interface ProductVariantProperties {
  readonly variantId: UuidV7;
  readonly productId: UuidV7;
  readonly name: string;
  readonly state: ProductState;
  readonly sellingPrice: Price;
  readonly compareAtPrice?: Price;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt?: Date;
  readonly correlationId?: string;
}

export class ProductVariant {
  public readonly properties: Readonly<ProductVariantProperties>;

  public constructor(properties: ProductVariantProperties) {
    if (properties.name.trim().length === 0) {
      throw new Error('Variant name is required');
    }
    if (properties.name.length > 256) {
      throw new Error('Variant name must be at most 256 characters');
    }
    if (
      properties.compareAtPrice !== undefined &&
      properties.compareAtPrice.value < properties.sellingPrice.value
    ) {
      throw new Error('Variant compare-at price must not be below the selling price');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Variant updatedAt cannot precede createdAt');
    }
    if (properties.publishedAt !== undefined && properties.publishedAt < properties.createdAt) {
      throw new Error('Variant publishedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
