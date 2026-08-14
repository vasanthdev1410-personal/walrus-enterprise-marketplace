/**
 * WEMP-M04-SPEC-001. Typed domain error for the product-catalog aggregate.
 * Codes are internal and non-disclosing; presentation layers map them to
 * generic responses and never expose catalog, policy, or moderation
 * internals.
 */
export type ProductDomainErrorCode =
  | 'PRODUCT_STATE_CONFLICT'
  | 'PRODUCT_TRANSITION_FORBIDDEN'
  | 'PRODUCT_ACTOR_REQUIRED'
  | 'PRODUCT_REASON_REQUIRED'
  | 'PRODUCT_PRECONDITION_FAILED'
  | 'PRODUCT_SOD_VIOLATION'
  | 'PRODUCT_UPDATE_FORBIDDEN'
  | 'PRODUCT_OWNER_CONFLICT'
  | 'PRODUCT_CATEGORY_CONFLICT'
  | 'PRODUCT_ATTRIBUTE_CONFLICT'
  | 'PRODUCT_SKU_CONFLICT'
  | 'PRODUCT_SKU_IMMUTABLE'
  | 'PRODUCT_PRICE_CONFLICT'
  | 'PRODUCT_MEDIA_CONFLICT'
  | 'PRODUCT_INVALID_ATTRIBUTE_VALUE'
  | 'PRODUCT_INVALID_MEDIA'
  | 'PRODUCT_NOT_SELLABLE'
  | 'PRODUCT_RETENTION_CONFIG_MISSING'
  | 'PRODUCT_RETENTION_CONFIG_INVALID';

export class ProductDomainError extends Error {
  public constructor(public readonly code: ProductDomainErrorCode) {
    super(code);
    this.name = 'ProductDomainError';
  }
}
