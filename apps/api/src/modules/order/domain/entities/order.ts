import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { OrderId } from '../value-objects/order-id';
import type { OrderState } from '../value-objects/order-state';

/**
 * WEMP-M08-SPEC-001 (decisions D-01/D-02/D-11/D-13). The Module
 * 08-owned order aggregate root: one order per CartSnapshot. Each order
 * belongs to exactly one customer profile (D-02, identical to M07 D-02).
 * Lifecycle states: PENDING, CONFIRMED, PAID, SHIPPED, DELIVERED,
 * CANCELLED, CLOSED (D-01). Maximum lines and total items are configurable
 * (D-13). The only identity linkage is the logical customerProfileId
 * reference to the Module 06 Customer profile — no PII is duplicated
 * (A-03/A-05).
 */
export interface OrderProperties {
  readonly orderId: OrderId;
  /** Logical reference to the Module 06 CustomerProfile (D-02). */
  readonly customerProfileId: UuidV7;
  /** Reference to the originating CartSnapshot (immutable handoff from M07). */
  readonly snapshotId: UuidV7;
  /** Reference to the originating Cart (M07). */
  readonly cartId: UuidV7;
  readonly state: OrderState;
  readonly totalLines: number;
  readonly totalItems: number;
  /** Subtotal in cents (from CartSnapshot, revalidated at checkout). */
  readonly subtotalAmountCents: number;
  /** Currency code (ISO 4217 alpha-3). */
  readonly subtotalCurrency: string;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly correlationId?: CorrelationIdentifier;
}

export class Order {
  public readonly properties: Readonly<OrderProperties>;

  public constructor(properties: OrderProperties) {
    if (!Number.isSafeInteger(properties.totalLines) || properties.totalLines < 0) {
      throw new Error('Order totalLines must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(properties.totalItems) || properties.totalItems < 0) {
      throw new Error('Order totalItems must be a non-negative safe integer');
    }
    if (properties.totalItems < properties.totalLines) {
      throw new Error('Order totalItems cannot be less than totalLines');
    }
    if (properties.totalLines === 0) {
      throw new Error('Order must contain at least one line');
    }
    if (
      !Number.isSafeInteger(properties.subtotalAmountCents) ||
      properties.subtotalAmountCents < 0
    ) {
      throw new Error('Order subtotalAmountCents must be a non-negative safe integer');
    }
    if (!/^[A-Z]{3}$/.test(properties.subtotalCurrency)) {
      throw new Error('Order subtotalCurrency must be an ISO 4217 alpha-3 code');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Order updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
