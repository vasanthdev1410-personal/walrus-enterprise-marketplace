import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';

/**
 * WEMP-M09-SPEC-001 (M09-M1). An append-only audit record for payment
 * lifecycle events only. Lifecycle events: PAYMENT_CREATED,
 * PAYMENT_PROCESSING, PAYMENT_CAPTURED, PAYMENT_FAILED, PAYMENT_EXPIRED,
 * PAYMENT_REFUND_INITIATED, PAYMENT_REFUNDED. Do NOT record every
 * webhook delivery or provider API call as a separate audit entry.
 */
export interface PaymentAuditRecordProperties {
  readonly auditEventId: UuidV7;
  readonly paymentId: UuidV7;
  readonly orderId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly eventType: string;
  readonly actorIdentityId: UuidV7;
  readonly correlationId?: CorrelationIdentifier;
  readonly evidenceDigest?: string;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

export class PaymentAuditRecord {
  public readonly properties: Readonly<PaymentAuditRecordProperties>;

  public constructor(properties: PaymentAuditRecordProperties) {
    if (properties.eventType.trim().length === 0) {
      throw new Error('Payment audit record eventType is required');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
