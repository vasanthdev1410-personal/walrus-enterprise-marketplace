/**
 * WEMP-M09-PLAN-001 M09-M3. Typed Module 09 application error. Codes are
 * internal and non-disclosing: presentation layers map them to generic
 * responses and never expose payment, provider, ownership, or security
 * internals. No database details ever surface through these codes.
 */
export type PaymentApplicationErrorCode =
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_OWNERSHIP_DENIED'
  | 'PAYMENT_STATE_CONFLICT'
  | 'PAYMENT_TRANSITION_FORBIDDEN'
  | 'PAYMENT_DUPLICATE'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'PAYMENT_CURRENCY_MISMATCH'
  | 'PAYMENT_ORDER_NOT_FOUND'
  | 'PAYMENT_ORDER_NOT_PENDING'
  | 'PAYMENT_ORDER_STATE_CONFLICT'
  | 'PAYMENT_CUSTOMER_NOT_FOUND'
  | 'PAYMENT_WEBHOOK_SIGNATURE_INVALID'
  | 'PAYMENT_WEBHOOK_DUPLICATE'
  | 'PAYMENT_WEBHOOK_EVENT_UNRECOGNIZED'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'PAYMENT_REFUND_EXCEEDS_CAPTURED'
  | 'PAYMENT_REFUND_NOT_ALLOWED'
  | 'PAYMENT_RATE_LIMITED'
  | 'PAYMENT_IDEMPOTENCY_CONFLICT'
  | 'PAYMENT_VALIDATION_FAILED';

export class PaymentApplicationError extends Error {
  public constructor(public readonly code: PaymentApplicationErrorCode) {
    super(code);
    this.name = 'PaymentApplicationError';
  }
}
