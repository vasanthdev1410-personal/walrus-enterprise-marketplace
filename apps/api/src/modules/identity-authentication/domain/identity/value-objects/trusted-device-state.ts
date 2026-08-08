export const TRUSTED_DEVICE_STATES = [
  'PENDING',
  'TRUSTED',
  'EXPIRED',
  'REVOKED',
  'BLOCKED',
] as const;
export type TrustedDeviceState = (typeof TRUSTED_DEVICE_STATES)[number];
