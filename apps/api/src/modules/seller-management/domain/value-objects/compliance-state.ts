/**
 * WEMP-M03-SPEC-001 §5. The seller compliance state is a DERIVED summary
 * recomputed from SellerBusinessVerification records on read; it is never a
 * writable input. Verification states map to compliance as follows:
 *   - no verification records            → NOT_STARTED
 *   - any mandatory verification EXPIRED → VERIFICATION_REQUIRED (D-12)
 *   - any mandatory verification REJECTED→ NON_COMPLIANT
 *   - all mandatory verifications APPROVED → COMPLIANT
 *   - otherwise (PENDING/SUBMITTED/IN_REVIEW) → IN_PROGRESS
 */
export const COMPLIANCE_STATES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'VERIFICATION_REQUIRED',
  'COMPLIANT',
  'NON_COMPLIANT',
] as const;

export type ComplianceState = (typeof COMPLIANCE_STATES)[number];
