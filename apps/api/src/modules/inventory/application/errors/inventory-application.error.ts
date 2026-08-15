/**
 * WEMP-M05-SPEC-001 §19/§23. Typed Module 05 application error. Codes are
 * internal and non-disclosing: presentation layers map them to generic
 * responses and never expose inventory, ledger, policy, or ownership
 * internals.
 */
export type InventoryApplicationErrorCode =
  | 'INVENTORY_NOT_FOUND'
  | 'INVENTORY_OWNERSHIP_DENIED'
  | 'INVENTORY_ADMIN_AUTHORIZATION_DENIED'
  | 'INVENTORY_SKU_UNAVAILABLE'
  | 'INVENTORY_STATE_CONFLICT'
  | 'INVENTORY_VALIDATION_FAILED'
  | 'INVENTORY_IDEMPOTENCY_CONFLICT'
  | 'INVENTORY_RATE_LIMITED'
  | 'INVENTORY_THRESHOLD_CONFIG_UNAVAILABLE';

export class InventoryApplicationError extends Error {
  public constructor(public readonly code: InventoryApplicationErrorCode) {
    super(code);
    this.name = 'InventoryApplicationError';
  }
}
