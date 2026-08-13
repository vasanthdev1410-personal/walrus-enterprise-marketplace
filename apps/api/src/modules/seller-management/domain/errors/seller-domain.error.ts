/**
 * WEMP-M03-SPEC-001. Typed domain error for the seller aggregate. Codes are
 * internal and non-disclosing; presentation layers map them to generic
 * responses and never expose policy or evidence internals.
 */
export type SellerDomainErrorCode =
  | 'SELLER_STATE_CONFLICT'
  | 'SELLER_TRANSITION_FORBIDDEN'
  | 'SELLER_ACTOR_REQUIRED'
  | 'SELLER_REASON_REQUIRED'
  | 'SELLER_PRECONDITION_FAILED'
  | 'SELLER_SOD_VIOLATION'
  | 'SELLER_UPDATE_FORBIDDEN'
  | 'SELLER_OWNER_CONFLICT'
  | 'SELLER_ASSOCIATION_CONFLICT'
  | 'SELLER_VERIFICATION_CONFLICT'
  | 'SELLER_INVALID_EVIDENCE'
  | 'SELLER_AGREEMENT_CONFLICT'
  | 'SELLER_RETENTION_CONFIG_MISSING'
  | 'SELLER_RETENTION_CONFIG_INVALID';

export class SellerDomainError extends Error {
  public constructor(public readonly code: SellerDomainErrorCode) {
    super(code);
    this.name = 'SellerDomainError';
  }
}
