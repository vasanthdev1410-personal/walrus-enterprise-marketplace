import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AttributeValueType } from '../value-objects/attribute-value-type';

/**
 * WEMP-M04-SPEC-001 §7/§17 (decision D-04). Per-product or per-variant
 * attribute value referencing an ACTIVE ProductAttributeDefinition. Values
 * are validated against the definition at write time (typed, constrained —
 * ProductCatalogPolicy.assertValidAttributeValue). Attribute IDs and
 * product/variant IDs are logical references within Module 04 storage.
 */
export interface ProductAttributeValueProperties {
  readonly attributeValueId: UuidV7;
  readonly productId: UuidV7;
  readonly variantId?: UuidV7;
  readonly attributeId: UuidV7;
  readonly valueType: AttributeValueType;
  readonly value: string;
  readonly state: 'ACTIVE' | 'REMOVED';
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class ProductAttributeValue {
  public readonly properties: Readonly<ProductAttributeValueProperties>;

  public constructor(properties: ProductAttributeValueProperties) {
    if (properties.value.trim().length === 0) {
      throw new Error('Attribute value is required');
    }
    if (properties.value.length > 512) {
      throw new Error('Attribute value must be at most 512 characters');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Attribute value updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
