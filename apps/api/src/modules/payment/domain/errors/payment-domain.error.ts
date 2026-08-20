/**
 * WEMP-M09-SPEC-001 (M09-M1). Typed domain error for the payment
 * aggregate. Codes are internal and non-disclosing; presentation
 * layers map them to generic responses and never expose provider,
 * ownership, or security internals.
 */
export type PaymentDomainErrorCode =
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_OWNERSHIP_DENIED'
  | 'PAYMENT_STATE_CONFLICT'
  | 'PAYMENT_TRANSITION_FORBIDDEN'
  | 'PAYMENT_ACTOR_REQUIRED'
  | 'PAYMENT_REASON_REQUIRED'
  | 'PAYMENT_PRECONDITION_FAILED'
  | 'PAYMENT_UPDATE_FORBIDDEN'
  | 'PAYMENT_READ_FORBIDDEN'
  | 'PAYMENT_STALE_VERSION'
  | 'PAYMENT_DUPLICATE'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'PAYMENT_CURRENCY_MISMATCH'
  | 'PAYMENT_ORDER_NOT_FOUND'
  | 'PAYMENT_ORDER_NOT_PENDING'
  | 'PAYMENT_CUSTOMER_NOT_FOUND'
  | 'PAYMENT_WEBHOOK_SIGNATURE_INVALID'
  | 'PAYMENT_WEBHOOK_DUPLICATE'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'PAYMENT_REFUND_EXCEEDS_CAPTURED'
  | 'PAYMENT_REFUND_NOT_ALLOWED'
  | 'PAYMENT_RETENTION_CONFIG_MISSING'
  | 'PAYMENT_RETENTION_CONFIG_INVALID';

export class PaymentDomainError extends Error {
  public constructor(public readonly code: PaymentDomainErrorCode) {
    super(code);
    this.name = 'PaymentDomainError';
  }
}
