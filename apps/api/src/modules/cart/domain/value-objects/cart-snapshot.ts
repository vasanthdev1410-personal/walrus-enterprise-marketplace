import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { CartId } from './cart-id';
import type { CartItemSnapshot } from './cart-item-snapshot';
import type { MoneyAmount } from './money-amount';

/**
 * WEMP-M07-SPEC-001 (decision D-08). An immutable snapshot of the entire
 * cart at checkout time. Passed to Module 08 Orders as the contract
 * artifact. M08 consumes this snapshot, not the live cart. The snapshot
 * is the authoritative frozen representation of what the customer
 * intended to order at the moment of checkout.
 */
export interface CartSnapshotProperties {
  readonly snapshotId: UuidV7;
  readonly cartId: CartId;
  readonly customerProfileId: UuidV7;
  readonly items: readonly CartItemSnapshot[];
  readonly totalLines: number;
  readonly totalItems: number;
  readonly subtotalAmount: MoneyAmount;
  readonly createdAt: Date;
  readonly correlationId?: CorrelationIdentifier;
}

export class CartSnapshot {
  public readonly properties: Readonly<CartSnapshotProperties>;

  public constructor(properties: CartSnapshotProperties) {
    if (properties.items.length === 0) {
      throw new Error('Cart snapshot must contain at least one item');
    }
    if (properties.totalLines !== properties.items.length) {
      throw new Error('Cart snapshot totalLines must match items count');
    }
    const computedTotal = properties.items.reduce((sum, item) => sum + item.properties.quantity, 0);
    if (properties.totalItems !== computedTotal) {
      throw new Error('Cart snapshot totalItems must match sum of item quantities');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
