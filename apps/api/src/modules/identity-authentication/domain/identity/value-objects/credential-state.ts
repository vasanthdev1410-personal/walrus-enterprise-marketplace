export const CREDENTIAL_STATES = [
  'CREATED',
  'VERIFIED',
  'ACTIVE',
  'REPLACED',
  'COMPROMISED',
  'REVOKED',
] as const;
export type CredentialState = (typeof CREDENTIAL_STATES)[number];
