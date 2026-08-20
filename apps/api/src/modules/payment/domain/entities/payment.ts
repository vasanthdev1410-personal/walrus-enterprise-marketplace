import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { PaymentId } from '../value-objects/payment-id';
import type { PaymentState } from '../value-objects/payment-state';

/**
 * WEMP-M09-SPEC-001 (M09-M1, decisions D-02/D-12). The Module
 * 09-owned payment aggregate root: one Payment per payment attempt for
 * an order. Each payment references exactly one Order (orderId) via
 * logical UUIDv7 — no cross-module FK (A-03). The payment stores the
 * amount validated against the order subtotal (D-13), the provider
 * identifiers, and the lifecycle state.
 *
 * Lifecycle states (D-03): PENDING, PROCESSING, CAPTURED, FAILED,
 * REFUND_PENDING, REFUNDED, EXPIRED.
 *
 * The only identity linkage is the logical customerProfileId reference
 * to the Module 06 CustomerProfile — no PII is duplicated (A-03/A-05).
 */
export interface PaymentProperties {
  readonly paymentId: PaymentId;
  /** Logical reference to the Module 08 Order (D-02). */
  readonly orderId: UuidV7;
  /** Logical reference to the Module 06 CustomerProfile (D-02). */
  readonly customerProfileId: UuidV7;
  readonly state: PaymentState;
  /** Payment amount in minor currency units (cents/paise). Must match order subtotal (D-13). */
  readonly amountCents: number;
  /** ISO 4217 alpha-3 currency code. */
  readonly currency: string;
  /** Payment provider identifier (e.g. 'razorpay'). */
  readonly provider: string;
  /** Provider-side order reference (e.g. Razorpay order ID). Set after creation with provider. */
  readonly providerOrderId: string | null;
  /** Provider-side payment reference (e.g. Razorpay payment ID). Set after capture. */
  readonly providerPaymentId: string | null;
  /** Client-supplied idempotency key for duplicate payment protection (D-07). */
  readonly idempotencyKey: string;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly correlationId?: CorrelationIdentifier;
}

export class Payment {
  public readonly properties: Readonly<PaymentProperties>;

  public constructor(properties: PaymentProperties) {
    if (!Number.isSafeInteger(properties.amountCents) || properties.amountCents < 0) {
      throw new Error('Payment amountCents must be a non-negative safe integer');
    }
    if (properties.amountCents === 0) {
      throw new Error('Payment amountCents must be greater than zero');
    }
    if (!/^[A-Z]{3}$/.test(properties.currency)) {
      throw new Error('Payment currency must be an ISO 4217 alpha-3 code');
    }
    if (properties.provider.trim().length === 0) {
      throw new Error('Payment provider is required');
    }
    if (properties.idempotencyKey.trim().length === 0) {
      throw new Error('Payment idempotencyKey is required');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Payment updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
