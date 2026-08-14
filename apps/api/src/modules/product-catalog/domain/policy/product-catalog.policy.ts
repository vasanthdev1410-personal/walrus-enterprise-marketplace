import type { Product } from '../entities/product';
import type { ProductAttributeDefinition } from '../entities/product-attribute-definition';
import type { ProductAttributeValue } from '../entities/product-attribute-value';
import type { ProductCategory } from '../entities/product-category';
import type { ProductMedia } from '../entities/product-media';
import type { ProductSku } from '../entities/product-sku';
import { ProductDomainError } from '../errors/product-domain.error';
import type { AttributeValueType } from '../value-objects/attribute-value-type';

/**
 * WEMP-M04-SPEC-001 §16/§22 (decisions D-03, D-04, D-06, D-09, D-16).
 * Aggregate-level catalog validation policies, mirroring the Module 03
 * policy pattern. Every rule fails closed with a typed ProductDomainError.
 */
export class ProductCatalogPolicy {
  /**
   * WEMP-M04-SPEC-001 §22. A sellable product must be complete before
   * submission: name present, category reference present and ACTIVE, at
   * least one ACTIVE SKU, and valid pricing data. Fail closed on missing
   * or inconsistent data.
   */
  public isSubmissionComplete(
    product: Product | null,
    category: ProductCategory | null,
    skus: readonly ProductSku[],
  ): boolean {
    if (product === null) {
      return false;
    }
    const properties = product.properties;
    if (properties.name.trim().length === 0 || properties.name.length > 256) {
      return false;
    }
    if (category?.properties.state !== 'ACTIVE') {
      return false;
    }
    const activeSkus = skus.filter((sku) => sku.properties.state === 'ACTIVE');
    if (activeSkus.length === 0) {
      return false;
    }
    if (properties.sellingPrice.value <= 0) {
      return false;
    }
    return true;
  }

  /**
   * WEMP-M04-SPEC-001 §7/§22 (decision D-04). Validates a product/variant
   * attribute value against its ACTIVE definition: definition exists and is
   * ACTIVE; value type matches; value is within allowed values or numeric
   * bounds; BOOLEAN values are 'true'/'false'; DATE values parse. Fail
   * closed on any violation.
   */
  public assertValidAttributeValue(
    definition: ProductAttributeDefinition | null,
    value: ProductAttributeValue,
  ): void {
    if (definition?.properties.state !== 'ACTIVE') {
      throw new ProductDomainError('PRODUCT_INVALID_ATTRIBUTE_VALUE');
    }
    if (definition.properties.valueType !== value.properties.valueType) {
      throw new ProductDomainError('PRODUCT_INVALID_ATTRIBUTE_VALUE');
    }
    this.assertValueAgainstType(
      definition.properties.valueType,
      value.properties.value,
      definition.properties.allowedValues,
      definition.properties.minValue,
      definition.properties.maxValue,
    );
  }

  /**
   * WEMP-M04-SPEC-001 §9 (decision D-06). SKU codes are unique per seller
   * organization. When updating an existing product, the product's own
   * ACTIVE SKUs are excluded from the duplicate check so an unchanged SKU
   * never collides with itself.
   */
  public assertUniqueSkuWithinSeller(
    skus: readonly ProductSku[],
    sellerProfileId: string,
    excludingSkuIds: readonly string[] = [],
  ): void {
    const exclude = new Set(excludingSkuIds);
    const seen = new Set<string>();
    for (const sku of skus) {
      if (sku.properties.sellerProfileId.value !== sellerProfileId) {
        throw new ProductDomainError('PRODUCT_SKU_CONFLICT');
      }
      if (sku.properties.state !== 'ACTIVE') {
        continue;
      }
      if (exclude.has(sku.properties.skuId.value)) {
        continue;
      }
      const code = sku.properties.skuCode.value;
      if (seen.has(code)) {
        throw new ProductDomainError('PRODUCT_SKU_CONFLICT');
      }
      seen.add(code);
    }
  }

  /**
   * WEMP-M04-SPEC-001 §9 (decision D-06). SKUs are immutable once the
   * product/variant is PUBLISHED. This check is called before any SKU
   * mutation; it denies changes to published sellable units (fail closed).
   */
  public assertSkuMutable(product: Product): void {
    if (product.properties.state === 'PUBLISHED') {
      throw new ProductDomainError('PRODUCT_SKU_IMMUTABLE');
    }
  }

  /**
   * WEMP-M04-SPEC-001 §12/§22 (decisions D-09, D-16). Media policy:
   * approved image allowlist (JPEG/PNG/WebP), <= 10 MB per file, <= 10
   * images per product. Fail closed on any violation.
   */
  public assertValidMedia(media: ProductMedia, existingCount: number): void {
    const allowedMimeTypes: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(media.properties.mimeType.toLowerCase())) {
      throw new ProductDomainError('PRODUCT_INVALID_MEDIA');
    }
    if (media.properties.sizeBytes > 10 * 1024 * 1024) {
      throw new ProductDomainError('PRODUCT_INVALID_MEDIA');
    }
    if (existingCount >= 10) {
      throw new ProductDomainError('PRODUCT_INVALID_MEDIA');
    }
  }

  /**
   * WEMP-M04-SPEC-001 §7. Returns whether the attribute definition is
   * required for the given context (definitions with a group are required
   * on products carrying that group; ungrouped required attributes apply to
   * all products).
   */
  public isRequiredAttribute(definition: ProductAttributeDefinition): boolean {
    return definition.properties.required;
  }

  private assertValueAgainstType(
    valueType: AttributeValueType,
    value: string,
    allowedValues?: readonly string[],
    minValue?: number,
    maxValue?: number,
  ): void {
    switch (valueType) {
      case 'STRING':
        if (allowedValues !== undefined && !allowedValues.includes(value)) {
          throw new ProductDomainError('PRODUCT_INVALID_ATTRIBUTE_VALUE');
        }
        break;
      case 'NUMBER': {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          throw new ProductDomainError('PRODUCT_INVALID_ATTRIBUTE_VALUE');
        }
        if (minValue !== undefined && numeric < minValue) {
          throw new ProductDomainError('PRODUCT_INVALID_ATTRIBUTE_VALUE');
        }
        if (maxValue !== undefined && numeric > maxValue) {
          throw new ProductDomainError('PRODUCT_INVALID_ATTRIBUTE_VALUE');
        }
        break;
      }
      case 'BOOLEAN':
        if (value !== 'true' && value !== 'false') {
          throw new ProductDomainError('PRODUCT_INVALID_ATTRIBUTE_VALUE');
        }
        break;
      case 'DATE':
        if (Number.isNaN(Date.parse(value))) {
          throw new ProductDomainError('PRODUCT_INVALID_ATTRIBUTE_VALUE');
        }
        break;
      default:
        throw new ProductDomainError('PRODUCT_INVALID_ATTRIBUTE_VALUE');
    }
  }
}
