import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';

/**
 * WEMP-M08-SPEC-001 (decision D-01). An append-only audit record for
 * order lifecycle events only. Lifecycle events: ORDER_CREATED,
 * ORDER_CONFIRMED, ORDER_PAID, ORDER_SHIPPED, ORDER_DELIVERED,
 * ORDER_CANCELLED, ORDER_CLOSED. Do NOT record every price revalidation
 * or inventory check as a separate audit entry.
 */
export interface OrderAuditRecordProperties {
  readonly auditEventId: UuidV7;
  readonly orderId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly eventType: string;
  readonly actorIdentityId: UuidV7;
  readonly correlationId?: CorrelationIdentifier;
  readonly evidenceDigest?: string;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

export class OrderAuditRecord {
  public readonly properties: Readonly<OrderAuditRecordProperties>;

  public constructor(properties: OrderAuditRecordProperties) {
    if (properties.eventType.trim().length === 0) {
      throw new Error('Order audit record eventType is required');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
