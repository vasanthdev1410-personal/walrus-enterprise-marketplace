import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M04-SPEC-001 §11 / WEMP-M04-CONTRACT-001 Part C (decision D-08).
 * The Module 04 ↔ Module 05 inventory boundary. Module 04 owns
 * product/variant/SKU definition only and never persists stock quantities.
 * Module 05 owns stock levels, availability, reservations, and stock
 * movements, consuming SKU references through this contract once an
 * approved Module 05 specification exists.
 *
 * Fail closed: until the Module 05 contract is wired, this port returns
 * `UNAVAILABLE` — no availability facts are ever fabricated.
 */
export type InventoryAvailabilityResult =
  | { readonly outcome: 'AVAILABLE'; readonly availableQuantity: number }
  | { readonly outcome: 'UNAVAILABLE' }
  | { readonly outcome: 'FAILED'; readonly reason: string };

export interface Module05InventoryContractPort {
  /**
   * Returns availability for a sellable unit. Fail closed: unknown SKU,
   * missing wiring, or any error resolves to UNAVAILABLE.
   */
  getAvailability(skuId: UuidV7): Promise<InventoryAvailabilityResult>;
}
