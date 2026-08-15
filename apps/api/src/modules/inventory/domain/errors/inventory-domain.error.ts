/**
 * WEMP-M05-SPEC-001. Typed domain error for the inventory aggregate.
 * Codes are internal and non-disclosing; presentation layers map them to
 * generic responses and never expose inventory, ledger, or policy
 * internals.
 */
export type InventoryDomainErrorCode =
  | 'INVENTORY_NEGATIVE_AVAILABLE'
  | 'INVENTORY_VERSION_CONFLICT'
  | 'INVENTORY_DELTA_BOUND_EXCEEDED'
  | 'INVENTORY_QUANTITY_INVALID'
  | 'INVENTORY_REASON_REQUIRED'
  | 'INVENTORY_RESERVE_EXCEEDS_AVAILABLE'
  | 'INVENTORY_RELEASE_EXCEEDS_RESERVED'
  | 'INVENTORY_MOVEMENT_FORBIDDEN'
  | 'INVENTORY_SKU_UNKNOWN_OR_NON_PUBLISHED'
  | 'INVENTORY_THRESHOLD_CONFIG_MISSING'
  | 'INVENTORY_THRESHOLD_CONFIG_INVALID'
  | 'INVENTORY_RETENTION_CONFIG_MISSING'
  | 'INVENTORY_RETENTION_CONFIG_INVALID'
  | 'INVENTORY_LIFECYCLE_FORBIDDEN';

export class InventoryDomainError extends Error {
  public constructor(public readonly code: InventoryDomainErrorCode) {
    super(code);
    this.name = 'InventoryDomainError';
  }
}
