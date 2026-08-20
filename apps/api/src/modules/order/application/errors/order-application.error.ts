/**
 * WEMP-M08-SPEC-001 §19/§23. Typed Module 08 application error. Codes are
 * internal and non-disclosing: presentation layers map them to generic
 * responses and never expose order, ownership, inventory, or pricing
 * internals. No database details ever surface through these codes.
 */
export type OrderApplicationErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_OWNERSHIP_DENIED'
  | 'ORDER_STATE_CONFLICT'
  | 'ORDER_TRANSITION_FORBIDDEN'
  | 'ORDER_UPDATE_FORBIDDEN'
  | 'ORDER_READ_FORBIDDEN'
  | 'ORDER_VALIDATION_FAILED'
  | 'ORDER_LINE_CONFLICT'
  | 'ORDER_LINE_NOT_FOUND'
  | 'ORDER_MAX_LINES_EXCEEDED'
  | 'ORDER_MAX_TOTAL_ITEMS_EXCEEDED'
  | 'ORDER_PRODUCT_UNAVAILABLE'
  | 'ORDER_SKU_UNAVAILABLE'
  | 'ORDER_INVENTORY_INSUFFICIENT'
  | 'ORDER_PRICE_MISMATCH'
  | 'ORDER_CHECKOUT_BLOCKED'
  | 'ORDER_STALE_VERSION'
  | 'ORDER_IDEMPOTENCY_CONFLICT'
  | 'ORDER_RATE_LIMITED'
  | 'ORDER_CUSTOMER_NOT_FOUND'
  | 'ORDER_REASON_REQUIRED'
  | 'ORDER_SNAPSHOT_NOT_FOUND'
  | 'ORDER_SNAPSHOT_INVALID'
  | 'ORDER_RETENTION_PROCESSING_FAILED';

export class OrderApplicationError extends Error {
  public constructor(public readonly code: OrderApplicationErrorCode) {
    super(code);
    this.name = 'OrderApplicationError';
  }
}
