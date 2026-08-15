import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { InventoryQuantity } from '../value-objects/inventory-quantity';

/**
 * WEMP-M05-SPEC-001 §4/§14 (decisions D-01, D-02). The per-SKU stock
 * pool — the inventory aggregate root. One pool per sellable unit (SKU)
 * in Phase 1; no warehouse/location dimension (D-01). Tracks `onHand` +
 * `reserved`; `available = onHand − reserved` is derived, never stored
 * (D-02). Invariant: `reserved ≤ onHand` — the pool is never constructed
 * in a state with negative available (hard no-negative rule, D-02).
 *
 * `skuId` and `sellerProfileId` are logical UUIDv7 references — the pool
 * never reads Module 04/03 storage (A-06) and carries no cross-module
 * foreign keys.
 */
export interface StockPoolProperties {
  readonly stockPoolId: UuidV7;
  readonly skuId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly onHand: InventoryQuantity;
  readonly reserved: InventoryQuantity;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class StockPool {
  public readonly properties: Readonly<StockPoolProperties>;

  public constructor(properties: StockPoolProperties) {
    if (properties.reserved.value > properties.onHand.value) {
      throw new Error('Reserved quantity must not exceed on-hand quantity');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Stock pool updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }

  /** Derived available quantity — never stored (decision D-02). */
  public get available(): InventoryQuantity {
    return new InventoryQuantity(this.properties.onHand.value - this.properties.reserved.value);
  }
}
