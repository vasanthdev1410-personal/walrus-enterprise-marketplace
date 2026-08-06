export const RECOVERY_APPROVAL_DECISIONS = ['APPROVED', 'REJECTED'] as const;
export type RecoveryApprovalDecision = (typeof RECOVERY_APPROVAL_DECISIONS)[number];
