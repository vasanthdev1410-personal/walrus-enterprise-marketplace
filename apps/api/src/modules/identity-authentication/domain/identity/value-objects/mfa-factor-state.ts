export const MFA_FACTOR_STATES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'REPLACEMENT_REQUIRED',
  'REVOKED',
] as const;
export type MfaFactorState = (typeof MFA_FACTOR_STATES)[number];
