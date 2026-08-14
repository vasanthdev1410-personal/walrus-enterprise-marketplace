import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CategoryState } from '../value-objects/category-state';

/**
 * WEMP-M04-SPEC-001 §6/§17 (decision D-03). Platform-defined, hierarchical
 * taxonomy with an optional parent; managed by Admin/Super Admin via the
 * explicit `catalog.category.manage` permission. Sellers read categories
 * only. Products reference categories by logical ID within Module 04
 * storage; category changes are audited.
 */
export interface ProductCategoryProperties {
  readonly categoryId: UuidV7;
  readonly name: string;
  readonly parentCategoryId?: UuidV7;
  readonly state: CategoryState;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly retiredAt?: Date;
}

export class ProductCategory {
  public readonly properties: Readonly<ProductCategoryProperties>;

  public constructor(properties: ProductCategoryProperties) {
    if (properties.name.trim().length === 0) {
      throw new Error('Category name is required');
    }
    if (properties.name.length > 256) {
      throw new Error('Category name must be at most 256 characters');
    }
    if (properties.parentCategoryId !== undefined) {
      if (properties.parentCategoryId.value === properties.categoryId.value) {
        throw new Error('Category cannot be its own parent');
      }
    }
    if (properties.state === 'RETIRED' && properties.retiredAt === undefined) {
      throw new Error('Retired category requires retiredAt');
    }
    if (properties.retiredAt !== undefined && properties.state !== 'RETIRED') {
      throw new Error('retiredAt requires the RETIRED category state');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Category updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
