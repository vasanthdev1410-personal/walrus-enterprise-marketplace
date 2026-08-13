/**
 * WEMP-M03-SPEC-001 §3 / decision D-05. Agreement types recorded by Module 03
 * in Phase 1. The COMMISSION type is the approved record scope; rate/terms
 * configuration remains an owner (Finance) decision for M03-M6 and is never
 * modeled here.
 */
export const SELLER_AGREEMENT_TYPES = ['COMMISSION'] as const;

export type SellerAgreementType = (typeof SELLER_AGREEMENT_TYPES)[number];
