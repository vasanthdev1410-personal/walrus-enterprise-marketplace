/**
 * WEMP-M05-SPEC-001 §6 (decision D-04). The typed stock movement
 * vocabulary approved with decision D-04 (option A). Every mutation is
 * one of these four event types, applied as a delta to the current pool
 * and appended to the InventoryMovementRecord ledger (D-09). There is no
 * fifth type and no batch variant (D-16); reserve/release (D-06) are
 * separate domain operations, not movement types.
 */
export const INVENTORY_MOVEMENT_TYPES = [
  'STOCK_IN',
  'STOCK_OUT',
  'ADJUSTMENT',
  'COUNT_CORRECTION',
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

/**
 * WEMP-M05-SPEC-001 §9 (decision D-08). Mandatory reason reference on
 * every outward/correction movement: STOCK_OUT, ADJUSTMENT, and
 * COUNT_CORRECTION require a non-blank reason reference (non-disclosing
 * externally, Module 03 §12.9). STOCK_IN has no mandatory reason.
 */
export function isReasonMandatory(movementType: InventoryMovementType): boolean {
  return movementType !== 'STOCK_IN';
}
