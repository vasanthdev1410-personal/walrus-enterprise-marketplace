/**
 * WEMP-M03-SPEC-001 §13. Typed Module 03 application error. Codes are internal
 * and non-disclosing: presentation layers map them to generic responses and
 * never expose policy, evidence, or reviewer internals.
 */
export type SellerApplicationErrorCode =
  | 'SELLER_NOT_FOUND'
  | 'SELLER_STATE_CONFLICT'
  | 'SELLER_TRANSITION_FORBIDDEN'
  | 'SELLER_PRECONDITION_FAILED'
  | 'SELLER_SOD_VIOLATION'
  | 'SELLER_OWNERSHIP_DENIED'
  | 'SELLER_DUPLICATE_DETECTED'
  | 'SELLER_IDENTITY_INELIGIBLE'
  | 'SELLER_VERIFICATION_INVALID'
  | 'SELLER_EVIDENCE_INTEGRITY_FAILED'
  | 'SELLER_RETENTION_CONFIG_MISSING'
  | 'SELLER_RETENTION_CONFIG_INVALID'
  | 'SELLER_RETENTION_PROCESSING_FAILED'
  | 'SELLER_LEGAL_HOLD_CONFLICT'
  | 'SELLER_ADMIN_AUTHORIZATION_DENIED'
  | 'SELLER_ROLE_ASSIGNMENT_DENIED'
  | 'SELLER_ROLE_REVOCATION_FAILED'
  | 'SELLER_IDEMPOTENCY_CONFLICT';

export class SellerApplicationError extends Error {
  public constructor(public readonly code: SellerApplicationErrorCode) {
    super(code);
    this.name = 'SellerApplicationError';
  }
}
