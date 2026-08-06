export const OTP_EVIDENCE_STATES = ['ACTIVE', 'CONSUMED', 'EXPIRED', 'INVALIDATED'] as const;
export type OtpEvidenceState = (typeof OTP_EVIDENCE_STATES)[number];
