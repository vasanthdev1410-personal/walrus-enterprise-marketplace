/**
 * WEMP-M03-SPEC-001 §3/§5. KYC/KYB verification types owned by Module 03.
 * GST, PAN and BANK are the mandatory verification set (named in approved
 * Module 01 v1.12 §7); ADDRESS captures business-address verification when
 * the owner approves the verification program. The mandatory set is defined
 * in SellerCompliancePolicy.
 */
export const VERIFICATION_TYPES = ['GST', 'PAN', 'BANK', 'ADDRESS'] as const;

export type VerificationType = (typeof VERIFICATION_TYPES)[number];
