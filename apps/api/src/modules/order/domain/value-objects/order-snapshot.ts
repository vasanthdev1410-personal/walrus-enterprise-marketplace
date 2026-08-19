import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { OrderId } from './order-id';
import type { OrderLineSnapshot } from './order-line-snapshot';
import type { MoneyAmount } from './money-amount';

/**
 * WEMP-M08-SPEC-001 (decisions D-03/D-08). An immutable snapshot of the
 * entire order at creation time. Stored for audit and retention purposes.
 * Identical structure to the input CartSnapshot but with an Order-scoped
 * snapshotId. The snapshot preserves the original CartSnapshot prices for
 * audit, even though OrderLines carry revalidated prices (D-03).
 */
export interface OrderSnapshotProperties {
  readonly snapshotId: UuidV7;
  readonly orderId: OrderId;
  readonly customerProfileId: UuidV7;
  readonly cartSnapshotId: UuidV7;
  readonly items: readonly OrderLineSnapshot[];
  readonly totalLines: number;
  readonly totalItems: number;
  readonly subtotalAmount: MoneyAmount;
  readonly createdAt: Date;
  readonly correlationId?: CorrelationIdentifier;
}

export class OrderSnapshot {
  public readonly properties: Readonly<OrderSnapshotProperties>;

  public constructor(properties: OrderSnapshotProperties) {
    if (properties.items.length === 0) {
      throw new Error('Order snapshot must contain at least one item');
    }
    if (properties.totalLines !== properties.items.length) {
      throw new Error('Order snapshot totalLines must match items count');
    }
    const computedTotal = properties.items.reduce((sum, item) => sum + item.properties.quantity, 0);
    if (properties.totalItems !== computedTotal) {
      throw new Error('Order snapshot totalItems must match sum of item quantities');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
