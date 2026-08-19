import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { OrderLineId } from '../value-objects/order-line-id';
import type { Quantity } from '../value-objects/quantity';
import type { MoneyAmount } from '../value-objects/money-amount';

/**
 * WEMP-M08-SPEC-001 (decisions D-01/D-03/D-04). A single order line item.
 * Lines are immutable after creation — price revalidation happens at order
 * creation time (D-03), not per-line mutation. The line carries the SKU
 * identity, the revalidated price, and the quantity.
 */
export interface OrderLineProperties {
  readonly orderLineId: OrderLineId;
  readonly orderId: UuidV7;
  /** Reference to originating M07 CartLine (for traceability). */
  readonly cartLineId: UuidV7;
  /** SKU-level identity (M04). */
  readonly skuId: UuidV7;
  /** Logical product reference (M04). */
  readonly productId: UuidV7;
  readonly skuCode: string;
  readonly quantity: Quantity;
  /** Price at checkout time (revalidated against M04, D-03). */
  readonly unitPrice: MoneyAmount;
  /** Snapshot of whether tax is included in the unit price (D-05). */
  readonly snapshotTaxIncluded: boolean;
  /** Whether price was revalidated at order creation (D-03). */
  readonly revalidated: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class OrderLine {
  public readonly properties: Readonly<OrderLineProperties>;

  public constructor(properties: OrderLineProperties) {
    if (properties.skuId.toString().length === 0) {
      throw new Error('Order line skuId is required');
    }
    if (properties.skuCode.trim().length === 0) {
      throw new Error('Order line skuCode is required');
    }
    if (properties.quantity.value < 1) {
      throw new Error('Order line quantity must be at least 1');
    }
    if (properties.unitPrice.cents < 0) {
      throw new Error('Order line unit price must be non-negative');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Order line updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
