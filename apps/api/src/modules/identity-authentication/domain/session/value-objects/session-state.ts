export const SESSION_STATES = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;
export type SessionState = (typeof SESSION_STATES)[number];
