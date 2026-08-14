/**
 * WEMP-M04-SPEC-001 §5 (Module 04 — Product Catalog, decision D-02). The
 * product lifecycle vocabulary approved with decision D-02 (option A):
 * DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, PUBLISHED,
 * CORRECTIONS_REQUESTED, UNPUBLISHED, REJECTED, CLOSED.
 * REJECTED and CLOSED are terminal states (invariant 2).
 */
export const PRODUCT_STATES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'CORRECTIONS_REQUESTED',
  'UNPUBLISHED',
  'REJECTED',
  'CLOSED',
] as const;

export type ProductState = (typeof PRODUCT_STATES)[number];

export const TERMINAL_PRODUCT_STATES: readonly ProductState[] = ['REJECTED', 'CLOSED'];

export function isTerminalProductState(state: ProductState): boolean {
  return TERMINAL_PRODUCT_STATES.includes(state);
}

/**
 * WEMP-M04-SPEC-001 §5 invariant 1 (decision D-12). Only products in
 * PUBLISHED are visible/consumable by trading modules (05/07/08), enforced
 * through a fail-closed ProductCatalogReadPort.
 */
export function isProductConsumable(state: ProductState): boolean {
  return state === 'PUBLISHED';
}
