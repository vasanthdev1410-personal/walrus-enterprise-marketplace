import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AttributeValueType } from '../value-objects/attribute-value-type';

/**
 * WEMP-M04-SPEC-001 §7/§17 (decision D-04). Platform-defined attribute
 * vocabulary (name, value type, unit where applicable, required/optional,
 * allowed values or bounds, group); managed by Admin/Super Admin via the
 * explicit `catalog.attribute.manage` permission. Product/variant attribute
 * values must reference ACTIVE definitions and are validated against the
 * definition at write time. Storage is structured/typed — no free-form
 * key/value.
 */
export interface ProductAttributeDefinitionProperties {
  readonly attributeId: UuidV7;
  readonly name: string;
  readonly valueType: AttributeValueType;
  readonly unit?: string;
  /** Whether the attribute is required on products that carry its group. */
  readonly required: boolean;
  readonly group?: string;
  /** Allowed values (STRING/ENUM-like) or numeric bounds, encoded as strings. */
  readonly allowedValues?: readonly string[];
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly state: 'ACTIVE' | 'RETIRED';
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly retiredAt?: Date;
}

export class ProductAttributeDefinition {
  public readonly properties: Readonly<ProductAttributeDefinitionProperties>;

  public constructor(properties: ProductAttributeDefinitionProperties) {
    if (properties.name.trim().length === 0) {
      throw new Error('Attribute definition name is required');
    }
    if (properties.name.length > 256) {
      throw new Error('Attribute definition name must be at most 256 characters');
    }
    if (properties.unit?.trim().length === 0) {
      throw new Error('Attribute definition unit must not be empty');
    }
    if (properties.allowedValues?.some((value) => value.trim().length === 0) === true) {
      throw new Error('Attribute definition allowed values must not be empty');
    }
    if (
      properties.minValue !== undefined &&
      properties.maxValue !== undefined &&
      properties.minValue > properties.maxValue
    ) {
      throw new Error('Attribute definition minValue must not exceed maxValue');
    }
    if (properties.state === 'RETIRED' && properties.retiredAt === undefined) {
      throw new Error('Retired attribute definition requires retiredAt');
    }
    if (properties.retiredAt !== undefined && properties.state !== 'RETIRED') {
      throw new Error('retiredAt requires the RETIRED attribute definition state');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Attribute definition updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
