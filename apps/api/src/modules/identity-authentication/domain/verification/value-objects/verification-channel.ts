export const VERIFICATION_CHANNELS = ['EMAIL', 'SMS', 'AUTHENTICATOR_APPLICATION'] as const;
export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];
