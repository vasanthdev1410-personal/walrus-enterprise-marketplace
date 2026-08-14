import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { Price } from '../value-objects/price';
import type { ProductState } from '../value-objects/product-state';

/**
 * WEMP-M04-SPEC-001 §4/§17 (decisions D-01, D-02, D-07). The catalog
 * aggregate root: lifecycle state, platform category reference, and
 * record-only pricing definition data (D-07 — no fee/tax/commission
 * computation). sellerProfileId is a logical UUIDv7 reference to the Module
 * 03 seller organization — never a cross-module FK and never read from
 * Module 03 storage. Variants, SKUs, attribute values, media, transitions
 * and audit records are child aggregates referenced by productId.
 */
export interface ProductProperties {
  readonly productId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly categoryId: UuidV7;
  readonly name: string;
  readonly state: ProductState;
  readonly sellingPrice: Price;
  readonly compareAtPrice?: Price;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly submittedAt?: Date;
  readonly approvedAt?: Date;
  readonly publishedAt?: Date;
  readonly closedAt?: Date;
  readonly correlationId?: CorrelationIdentifier;
}

export class Product {
  public readonly properties: Readonly<ProductProperties>;

  public constructor(properties: ProductProperties) {
    if (properties.name.trim().length === 0) {
      throw new Error('Product name is required');
    }
    if (properties.name.length > 256) {
      throw new Error('Product name must be at most 256 characters');
    }
    if (
      properties.compareAtPrice !== undefined &&
      properties.compareAtPrice.value < properties.sellingPrice.value
    ) {
      throw new Error('Product compare-at price must not be below the selling price');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Product updatedAt cannot precede createdAt');
    }
    if (properties.submittedAt !== undefined && properties.submittedAt < properties.createdAt) {
      throw new Error('Product submittedAt cannot precede createdAt');
    }
    if (properties.approvedAt !== undefined && properties.approvedAt < properties.createdAt) {
      throw new Error('Product approvedAt cannot precede createdAt');
    }
    if (properties.publishedAt !== undefined && properties.publishedAt < properties.createdAt) {
      throw new Error('Product publishedAt cannot precede createdAt');
    }
    if (properties.closedAt !== undefined && properties.closedAt < properties.createdAt) {
      throw new Error('Product closedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
