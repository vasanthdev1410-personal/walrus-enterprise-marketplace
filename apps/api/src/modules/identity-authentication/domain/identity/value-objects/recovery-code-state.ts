export const RECOVERY_CODE_SET_STATES = [
  'ACTIVE',
  'EXHAUSTED',
  'SUPERSEDED',
  'INVALIDATED',
] as const;
export type RecoveryCodeSetState = (typeof RECOVERY_CODE_SET_STATES)[number];

export const RECOVERY_CODE_STATES = ['ACTIVE', 'CONSUMED', 'INVALIDATED'] as const;
export type RecoveryCodeState = (typeof RECOVERY_CODE_STATES)[number];
