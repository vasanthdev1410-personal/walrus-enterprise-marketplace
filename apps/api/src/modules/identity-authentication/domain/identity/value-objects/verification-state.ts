export const IDENTITY_VERIFICATION_STATES = ['PENDING_VERIFICATION', 'VERIFIED'] as const;
export type IdentityVerificationState = (typeof IDENTITY_VERIFICATION_STATES)[number];

export const IDENTIFIER_VERIFICATION_STATES = [
  'UNVERIFIED',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'RETIRED',
  'ANONYMIZED',
] as const;
export type IdentifierVerificationState = (typeof IDENTIFIER_VERIFICATION_STATES)[number];
