export const AUTHENTICATION_ASSURANCE_LEVELS = ['AAL0', 'AAL1', 'AAL2'] as const;
export type AuthenticationAssuranceLevel = (typeof AUTHENTICATION_ASSURANCE_LEVELS)[number];
