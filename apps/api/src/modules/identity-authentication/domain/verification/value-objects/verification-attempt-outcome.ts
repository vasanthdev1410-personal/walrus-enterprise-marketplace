export const VERIFICATION_ATTEMPT_OUTCOMES = [
  'SUCCEEDED',
  'REJECTED',
  'EXPIRED',
  'RATE_LIMITED',
  'FAILED_SECURELY',
  'TEMPORARILY_UNAVAILABLE',
] as const;
export type VerificationAttemptOutcome = (typeof VERIFICATION_ATTEMPT_OUTCOMES)[number];
