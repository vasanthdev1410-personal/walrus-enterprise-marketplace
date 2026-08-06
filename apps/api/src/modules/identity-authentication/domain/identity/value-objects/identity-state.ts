export const IDENTITY_STATES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'LOCKED',
  'SUSPENDED',
  'DISABLED',
  'DELETED',
] as const;

export type IdentityState = (typeof IDENTITY_STATES)[number];
