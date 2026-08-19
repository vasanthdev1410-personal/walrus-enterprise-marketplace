/**
 * WEMP-M08-SPEC-001. Typed domain error for the order aggregate. Codes are
 * internal and non-disclosing; presentation layers map them to generic
 * responses and never expose policy, ownership, or PII internals.
 */
export type OrderDomainErrorCode =
  | 'ORDER_STATE_CONFLICT'
  | 'ORDER_TRANSITION_FORBIDDEN'
  | 'ORDER_ACTOR_REQUIRED'
  | 'ORDER_REASON_REQUIRED'
  | 'ORDER_PRECONDITION_FAILED'
  | 'ORDER_UPDATE_FORBIDDEN'
  | 'ORDER_READ_FORBIDDEN'
  | 'ORDER_OWNERSHIP_CONFLICT'
  | 'ORDER_LINE_CONFLICT'
  | 'ORDER_LINE_NOT_FOUND'
  | 'ORDER_LINE_QUANTITY_EXCEEDED'
  | 'ORDER_MAX_LINES_EXCEEDED'
  | 'ORDER_MAX_TOTAL_ITEMS_EXCEEDED'
  | 'ORDER_PRODUCT_UNAVAILABLE'
  | 'ORDER_SKU_UNAVAILABLE'
  | 'ORDER_PRICE_MISMATCH'
  | 'ORDER_INVENTORY_INSUFFICIENT'
  | 'ORDER_CHECKOUT_BLOCKED'
  | 'ORDER_RETENTION_CONFIG_MISSING'
  | 'ORDER_RETENTION_CONFIG_INVALID'
  | 'ORDER_STALE_VERSION'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_SNAPSHOT_NOT_FOUND'
  | 'ORDER_CUSTOMER_NOT_FOUND';

export class OrderDomainError extends Error {
  public constructor(public readonly code: OrderDomainErrorCode) {
    super(code);
    this.name = 'OrderDomainError';
  }
}
