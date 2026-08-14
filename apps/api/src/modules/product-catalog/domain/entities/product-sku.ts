import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SkuCode } from '../value-objects/sku-code';

/**
 * WEMP-M04-SPEC-001 §9/§17 (decision D-06). The inventory-referenceable
 * sellable-unit identifier — one per product or per variant (D-05). SKU
 * uniqueness is scoped per seller organization (resolved through the
 * ownership resolver at the aggregate boundary); SKUs are seller-supplied
 * with the validated SkuCode format (D-16) and immutable once the
 * product/variant is PUBLISHED (fail closed).
 */
export interface ProductSkuProperties {
  readonly skuId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly productId: UuidV7;
  readonly variantId?: UuidV7;
  readonly skuCode: SkuCode;
  readonly state: 'ACTIVE' | 'CLOSED';
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly closedAt?: Date;
}

export class ProductSku {
  public readonly properties: Readonly<ProductSkuProperties>;

  public constructor(properties: ProductSkuProperties) {
    if (properties.state === 'CLOSED' && properties.closedAt === undefined) {
      throw new Error('Closed SKU requires closedAt');
    }
    if (properties.closedAt !== undefined && properties.state !== 'CLOSED') {
      throw new Error('closedAt requires the CLOSED SKU state');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('SKU updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
