export const IDENTIFIER_TYPES = ['EMAIL', 'MOBILE'] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];
