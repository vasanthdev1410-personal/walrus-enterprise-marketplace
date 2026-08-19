import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { OrderLineId } from './order-line-id';
import type { MoneyAmount } from './money-amount';

/**
 * WEMP-M08-SPEC-001 (decisions D-03/D-08). An immutable snapshot of a
 * single order line at creation time. Used for the order audit snapshot.
 * Carries the SKU identity, the original CartSnapshot price (not the
 * revalidated price), and the quantity.
 */
export interface OrderLineSnapshotProperties {
  readonly orderLineId: OrderLineId;
  readonly skuId: UuidV7;
  readonly productId: UuidV7;
  readonly skuCode: string;
  readonly quantity: number;
  /** Original CartSnapshot price (preserved for audit, D-03). */
  readonly originalUnitPrice: MoneyAmount;
  /** Revalidated price at checkout (D-03). */
  readonly revalidatedUnitPrice: MoneyAmount;
  readonly snapshotTaxIncluded: boolean;
}

export class OrderLineSnapshot {
  public readonly properties: Readonly<OrderLineSnapshotProperties>;

  public constructor(properties: OrderLineSnapshotProperties) {
    if (!Number.isSafeInteger(properties.quantity) || properties.quantity < 1) {
      throw new Error('Order line snapshot quantity must be a positive safe integer');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
