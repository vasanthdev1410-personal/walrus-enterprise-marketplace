/**
 * WEMP-M03-SPEC-001 §4 (Module 03 — Seller Management). The seller lifecycle
 * vocabulary approved with decision D-07: DRAFT, SUBMITTED, UNDER_REVIEW,
 * CORRECTIONS_REQUESTED, APPROVED, ACTIVE, SUSPENDED, REJECTED, CLOSED.
 * REJECTED and CLOSED are terminal states.
 */
export const SELLER_STATES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CORRECTIONS_REQUESTED',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'CLOSED',
] as const;

export type SellerState = (typeof SELLER_STATES)[number];

export const TERMINAL_SELLER_STATES: readonly SellerState[] = ['REJECTED', 'CLOSED'];

export function isTerminalSellerState(state: SellerState): boolean {
  return TERMINAL_SELLER_STATES.includes(state);
}
