/**
 * WEMP-M06-SPEC-001 §19/§23. Typed Module 06 application error. Codes are
 * internal and non-disclosing: presentation layers map them to generic
 * responses and never expose customer, address, lifecycle, retention, or
 * ownership internals. No database details ever surface through these codes.
 */
export type CustomerApplicationErrorCode =
  | 'CUSTOMER_NOT_FOUND'
  | 'CUSTOMER_OWNERSHIP_DENIED'
  | 'CUSTOMER_ADMIN_AUTHORIZATION_DENIED'
  | 'CUSTOMER_STATE_CONFLICT'
  | 'CUSTOMER_TRANSITION_FORBIDDEN'
  | 'CUSTOMER_UPDATE_FORBIDDEN'
  | 'CUSTOMER_READ_FORBIDDEN'
  | 'CUSTOMER_DUPLICATE_DETECTED'
  | 'CUSTOMER_VALIDATION_FAILED'
  | 'CUSTOMER_ADDRESS_CONFLICT'
  | 'CUSTOMER_BUSINESS_PROFILE_CONFLICT'
  | 'CUSTOMER_PREFERENCE_FORBIDDEN'
  | 'CUSTOMER_REASON_REQUIRED'
  | 'CUSTOMER_IDEMPOTENCY_CONFLICT'
  | 'CUSTOMER_RATE_LIMITED'
  | 'CUSTOMER_RETENTION_CONFIG_MISSING'
  | 'CUSTOMER_RETENTION_CONFIG_INVALID'
  | 'CUSTOMER_RETENTION_PROCESSING_FAILED';

export class CustomerApplicationError extends Error {
  public constructor(public readonly code: CustomerApplicationErrorCode) {
    super(code);
    this.name = 'CustomerApplicationError';
  }
}
