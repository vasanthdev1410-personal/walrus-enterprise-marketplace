import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CartLineId } from '../value-objects/cart-line-id';
import type { Quantity } from '../value-objects/quantity';
import type { MoneyAmount } from '../value-objects/money-amount';

/**
 * WEMP-M07-SPEC-001 (decisions D-03/D-04/D-05). A single cart line item.
 * The uniqueness key within a cart is the skuId (D-03). The line carries
 * the quantity, the price snapshot at add-time (server-side M04 authority,
 * D-05), and a "product unavailable" flag for deactivated products/SKUs
 * (D-12/D-13). Lines are never hard-deleted; removal is auditable.
 */
export interface CartLineProperties {
  readonly cartLineId: CartLineId;
  readonly cartId: UuidV7;
  /** SKU-level identity: the uniqueness key within the cart (D-03). */
  readonly skuId: UuidV7;
  /** Logical product reference (metadata, not part of identity). */
  readonly productId: UuidV7;
  readonly skuCode: string;
  readonly quantity: Quantity;
  /** Price snapshot at add-time: M04 sellingPrice, cents, inclusive of tax (D-05). */
  readonly unitPrice: MoneyAmount;
  /** Snapshot of whether tax is included in the unit price (D-05). */
  readonly snapshotTaxIncluded: boolean;
  /** Product deactivated/SKU deactivated after add: customer sees "unavailable" (D-12/D-13). */
  readonly productUnavailable: boolean;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class CartLine {
  public readonly properties: Readonly<CartLineProperties>;

  public constructor(properties: CartLineProperties) {
    if (properties.skuId.toString().length === 0) {
      throw new Error('Cart line skuId is required');
    }
    if (properties.skuCode.trim().length === 0) {
      throw new Error('Cart line skuCode is required');
    }
    if (properties.quantity.value < 1) {
      throw new Error('Cart line quantity must be at least 1');
    }
    if (properties.unitPrice.cents < 0) {
      throw new Error('Cart line unit price must be non-negative');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Cart line updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
