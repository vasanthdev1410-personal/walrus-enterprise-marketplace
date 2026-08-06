export const VERIFICATION_CHALLENGE_STATES = [
  'CREATED',
  'PENDING',
  'CHALLENGE_ISSUED',
  'VERIFIED',
  'EXPIRED',
  'FAILED',
  'CANCELLED',
] as const;
export type VerificationChallengeState = (typeof VERIFICATION_CHALLENGE_STATES)[number];
