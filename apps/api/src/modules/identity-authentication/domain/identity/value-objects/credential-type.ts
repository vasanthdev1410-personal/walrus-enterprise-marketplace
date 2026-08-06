export const CREDENTIAL_TYPES = ['PASSWORD', 'EMAIL_VERIFICATION', 'MOBILE_VERIFICATION'] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];
