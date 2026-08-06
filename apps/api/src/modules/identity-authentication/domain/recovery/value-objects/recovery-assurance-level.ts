export const RECOVERY_ASSURANCE_LEVELS = ['RA0', 'RA1', 'RA2'] as const;
export type RecoveryAssuranceLevel = (typeof RECOVERY_ASSURANCE_LEVELS)[number];
