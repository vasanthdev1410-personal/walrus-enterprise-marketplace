export const CREDENTIAL_HISTORY_EVENT_TYPES = [
  'CREATED',
  'VERIFIED',
  'ACTIVATED',
  'REPLACED',
  'MARKED_COMPROMISED',
  'REVOKED',
] as const;
export type CredentialHistoryEventType = (typeof CREDENTIAL_HISTORY_EVENT_TYPES)[number];
