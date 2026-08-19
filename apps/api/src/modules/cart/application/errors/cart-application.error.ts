/**
 * WEMP-M07-SPEC-001 §19/§23. Typed Module 07 application error. Codes are
 * internal and non-disclosing: presentation layers map them to generic
 * responses and never expose cart, ownership, inventory, or pricing
 * internals. No database details ever surface through these codes.
 */
export type CartApplicationErrorCode =
  | 'CART_NOT_FOUND'
  | 'CART_OWNERSHIP_DENIED'
  | 'CART_STATE_CONFLICT'
  | 'CART_TRANSITION_FORBIDDEN'
  | 'CART_UPDATE_FORBIDDEN'
  | 'CART_READ_FORBIDDEN'
  | 'CART_VALIDATION_FAILED'
  | 'CART_LINE_CONFLICT'
  | 'CART_LINE_NOT_FOUND'
  | 'CART_MAX_LINES_EXCEEDED'
  | 'CART_MAX_TOTAL_ITEMS_EXCEEDED'
  | 'CART_PRODUCT_UNAVAILABLE'
  | 'CART_SKU_UNAVAILABLE'
  | 'CART_INVENTORY_INSUFFICIENT'
  | 'CART_PRICE_MISMATCH'
  | 'CART_CHECKOUT_BLOCKED'
  | 'CART_STALE_VERSION'
  | 'CART_IDEMPOTENCY_CONFLICT'
  | 'CART_RATE_LIMITED'
  | 'CART_CUSTOMER_NOT_FOUND'
  | 'CART_REASON_REQUIRED'
  | 'CART_RETENTION_PROCESSING_FAILED';

export class CartApplicationError extends Error {
  public constructor(public readonly code: CartApplicationErrorCode) {
    super(code);
    this.name = 'CartApplicationError';
  }
}
