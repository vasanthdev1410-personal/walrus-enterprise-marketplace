/**
 * WEMP-M05-SPEC-001 §5/§11.1 (decisions D-03, D-10). The derived
 * availability outcome for the Module 04 ↔ Module 05 inventory contract
 * boundary. Derived from Module 05's own quantities — never stored.
 *   - AVAILABLE when the SKU is PUBLISHED per the Module 04 contract fact
 *     and `available > 0`
 *   - UNAVAILABLE when the SKU is unknown/non-PUBLISHED or
 *     `available ≤ 0` (fail closed)
 *   - FAILED on internal error (never fabricated; the outcome shape is
 *     exposed so adapters can map errors non-disclosingly)
 */
export const INVENTORY_AVAILABILITY_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'FAILED'] as const;

export type InventoryAvailabilityStatus = (typeof INVENTORY_AVAILABILITY_STATUSES)[number];

export interface InventoryAvailabilityOutcome {
  readonly status: InventoryAvailabilityStatus;
  /** Present only when status is AVAILABLE. */
  readonly availableQuantity?: number;
  /** Present only when status is FAILED; non-disclosing. */
  readonly reason?: string;
}

export function availableOutcome(availableQuantity: number): InventoryAvailabilityOutcome {
  return { status: 'AVAILABLE', availableQuantity };
}

export function unavailableOutcome(): InventoryAvailabilityOutcome {
  return { status: 'UNAVAILABLE' };
}

export function failedOutcome(reason: string): InventoryAvailabilityOutcome {
  return { status: 'FAILED', reason };
}
