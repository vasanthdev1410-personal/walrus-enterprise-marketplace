import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CartLineId } from './cart-line-id';
import type { MoneyAmount } from './money-amount';

/**
 * WEMP-M07-SPEC-001 (decisions D-03/D-05/D-08). An immutable snapshot of
 * a single cart line at a point in time. Used for the M08 checkout handoff
 * (CartSnapshot contains an array of these). Carries the SKU identity,
 * the price snapshot, and the quantity — everything M08 needs to create
 * an Order line without reading M07 or M04 storage.
 */
export interface CartItemSnapshotProperties {
  readonly cartLineId: CartLineId;
  readonly skuId: UuidV7;
  readonly productId: UuidV7;
  readonly skuCode: string;
  readonly quantity: number;
  readonly unitPrice: MoneyAmount;
  readonly snapshotTaxIncluded: boolean;
  readonly productUnavailable: boolean;
}

export class CartItemSnapshot {
  public readonly properties: Readonly<CartItemSnapshotProperties>;

  public constructor(properties: CartItemSnapshotProperties) {
    if (!Number.isSafeInteger(properties.quantity) || properties.quantity < 1) {
      throw new Error('Cart item snapshot quantity must be a positive safe integer');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
