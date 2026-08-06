export const RECOVERY_ATTEMPT_TYPES = [
  'EVIDENCE_SUBMISSION',
  'EVIDENCE_VALIDATION',
  'APPROVAL_VALIDATION',
  'EXECUTION',
] as const;
export type RecoveryAttemptType = (typeof RECOVERY_ATTEMPT_TYPES)[number];

export const RECOVERY_ATTEMPT_OUTCOMES = [
  'SUCCEEDED',
  'REJECTED',
  'FAILED_SECURELY',
  'TEMPORARILY_UNAVAILABLE',
] as const;
export type RecoveryAttemptOutcome = (typeof RECOVERY_ATTEMPT_OUTCOMES)[number];
