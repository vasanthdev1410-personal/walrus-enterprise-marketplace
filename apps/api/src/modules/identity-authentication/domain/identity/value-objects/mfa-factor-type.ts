export const MFA_FACTOR_TYPES = ['TOTP_AUTHENTICATOR'] as const;
export type MfaFactorType = (typeof MFA_FACTOR_TYPES)[number];

export const MFA_ENROLLMENT_STATES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'REPLACEMENT_REQUIRED',
  'DISABLED',
] as const;
export type MfaEnrollmentState = (typeof MFA_ENROLLMENT_STATES)[number];
