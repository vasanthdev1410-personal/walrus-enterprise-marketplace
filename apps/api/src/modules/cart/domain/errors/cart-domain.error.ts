/**
 * WEMP-M07-SPEC-001. Typed domain error for the cart aggregate. Codes are
 * internal and non-disclosing; presentation layers map them to generic
 * responses and never expose policy, ownership, or PII internals.
 */
export type CartDomainErrorCode =
  | 'CART_STATE_CONFLICT'
  | 'CART_TRANSITION_FORBIDDEN'
  | 'CART_ACTOR_REQUIRED'
  | 'CART_REASON_REQUIRED'
  | 'CART_PRECONDITION_FAILED'
  | 'CART_UPDATE_FORBIDDEN'
  | 'CART_READ_FORBIDDEN'
  | 'CART_OWNERSHIP_CONFLICT'
  | 'CART_LINE_CONFLICT'
  | 'CART_LINE_NOT_FOUND'
  | 'CART_LINE_QUANTITY_EXCEEDED'
  | 'CART_MAX_LINES_EXCEEDED'
  | 'CART_MAX_TOTAL_ITEMS_EXCEEDED'
  | 'CART_PRODUCT_UNAVAILABLE'
  | 'CART_SKU_UNAVAILABLE'
  | 'CART_PRICE_MISMATCH'
  | 'CART_INVENTORY_INSUFFICIENT'
  | 'CART_CHECKOUT_BLOCKED'
  | 'CART_RETENTION_CONFIG_MISSING'
  | 'CART_RETENTION_CONFIG_INVALID'
  | 'CART_STALE_VERSION';

export class CartDomainError extends Error {
  public constructor(public readonly code: CartDomainErrorCode) {
    super(code);
    this.name = 'CartDomainError';
  }
}
