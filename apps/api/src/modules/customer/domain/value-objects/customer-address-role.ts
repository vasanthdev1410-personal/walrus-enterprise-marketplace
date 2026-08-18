/**
 * WEMP-M06-SPEC-001 §7 (decision D-04). Customer address role tags. An
 * address carries at least one role; SHIPPING and BILLING are the only roles
 * approved for Phase 1.
 */
export const CUSTOMER_ADDRESS_ROLES = ['SHIPPING', 'BILLING'] as const;

export type CustomerAddressRole = (typeof CUSTOMER_ADDRESS_ROLES)[number];
