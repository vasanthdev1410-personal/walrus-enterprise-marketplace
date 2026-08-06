export const REFRESH_TOKEN_STATES = ['ACTIVE', 'USED', 'REVOKED', 'EXPIRED'] as const;
export type RefreshTokenState = (typeof REFRESH_TOKEN_STATES)[number];

export const REFRESH_TOKEN_FAMILY_STATES = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;
export type RefreshTokenFamilyState = (typeof REFRESH_TOKEN_FAMILY_STATES)[number];
