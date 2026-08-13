/**
 * WEMP-M03-SPEC-001 §5. Per-type KYC/KYB verification lifecycle:
 * PENDING → SUBMITTED → IN_REVIEW → APPROVED | REJECTED, plus EXPIRED for
 * verification documents with validity windows (decision D-12). EXPIRED is a
 * terminal verification state requiring a new verification generation.
 */
export const VERIFICATION_STATES = [
  'PENDING',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const TERMINAL_VERIFICATION_STATES: readonly VerificationState[] = [
  'APPROVED',
  'REJECTED',
  'EXPIRED',
];
