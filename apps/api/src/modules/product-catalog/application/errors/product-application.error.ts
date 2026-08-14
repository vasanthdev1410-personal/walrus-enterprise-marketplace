/**
 * WEMP-M04-SPEC-001 §23/§25. Typed Module 04 application error. Codes are
 * internal and non-disclosing: presentation layers map them to generic
 * responses and never expose catalog, policy, or moderation internals.
 */
export type ProductApplicationErrorCode =
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_STATE_CONFLICT'
  | 'PRODUCT_TRANSITION_FORBIDDEN'
  | 'PRODUCT_PRECONDITION_FAILED'
  | 'PRODUCT_SOD_VIOLATION'
  | 'PRODUCT_OWNERSHIP_DENIED'
  | 'PRODUCT_DUPLICATE_DETECTED'
  | 'PRODUCT_SKU_IMMUTABLE'
  | 'PRODUCT_INVALID_ATTRIBUTE_VALUE'
  | 'PRODUCT_INVALID_MEDIA'
  | 'PRODUCT_MEDIA_INTEGRITY_FAILED'
  | 'PRODUCT_CATEGORY_CONFLICT'
  | 'PRODUCT_ADMIN_AUTHORIZATION_DENIED'
  | 'PRODUCT_REVIEWER_UNRESOLVED'
  | 'PRODUCT_IDEMPOTENCY_CONFLICT';

export class ProductApplicationError extends Error {
  public constructor(public readonly code: ProductApplicationErrorCode) {
    super(code);
    this.name = 'ProductApplicationError';
  }
}
