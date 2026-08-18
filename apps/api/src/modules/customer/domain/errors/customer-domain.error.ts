/**
 * WEMP-M06-SPEC-001. Typed domain error for the customer aggregate. Codes are
 * internal and non-disclosing; presentation layers map them to generic
 * responses and never expose policy, ownership, or PII internals.
 */
export type CustomerDomainErrorCode =
  | 'CUSTOMER_STATE_CONFLICT'
  | 'CUSTOMER_TRANSITION_FORBIDDEN'
  | 'CUSTOMER_ACTOR_REQUIRED'
  | 'CUSTOMER_REASON_REQUIRED'
  | 'CUSTOMER_PRECONDITION_FAILED'
  | 'CUSTOMER_UPDATE_FORBIDDEN'
  | 'CUSTOMER_READ_FORBIDDEN'
  | 'CUSTOMER_OWNERSHIP_CONFLICT'
  | 'CUSTOMER_ADDRESS_CONFLICT'
  | 'CUSTOMER_DEFAULT_ADDRESS_CONFLICT'
  | 'CUSTOMER_BUSINESS_PROFILE_CONFLICT'
  | 'CUSTOMER_PREFERENCE_KEY_FORBIDDEN'
  | 'CUSTOMER_RETENTION_CONFIG_MISSING'
  | 'CUSTOMER_RETENTION_CONFIG_INVALID';

export class CustomerDomainError extends Error {
  public constructor(public readonly code: CustomerDomainErrorCode) {
    super(code);
    this.name = 'CustomerDomainError';
  }
}
