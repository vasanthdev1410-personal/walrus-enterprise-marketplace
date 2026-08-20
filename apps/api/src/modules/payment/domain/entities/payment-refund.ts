import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PaymentRefundId } from '../value-objects/payment-refund-id';

/**
 * WEMP-M09-SPEC-001 (M09-M1, decision D-04). A payment refund entity.
 * Refunds are associated with a single payment. Each refund tracks the
 * refund amount (which may be full or partial), the provider-side refund
 * identifier, and the refund lifecycle state.
 *
 * Refund states: PENDING → PROCESSING → REFUNDED | FAILED.
 * Terminal states: REFUNDED, FAILED.
 */
export const REFUND_STATES = ['PENDING', 'PROCESSING', 'REFUNDED', 'FAILED'] as const;
export type RefundState = (typeof REFUND_STATES)[number];
export const TERMINAL_REFUND_STATES: readonly RefundState[] = ['REFUNDED', 'FAILED'];

export function isTerminalRefundState(state: RefundState): boolean {
  return TERMINAL_REFUND_STATES.includes(state);
}

export interface PaymentRefundProperties {
  readonly paymentRefundId: PaymentRefundId;
  readonly paymentId: UuidV7;
  /** Refund amount in minor currency units (cents/paise). Must be <= payment amount. */
  readonly amountCents: number;
  /** ISO 4217 alpha-3 currency code. */
  readonly currency: string;
  readonly state: RefundState;
  /** Provider-side refund reference (e.g. Razorpay refund ID). */
  readonly providerRefundId: string | null;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class PaymentRefund {
  public readonly properties: Readonly<PaymentRefundProperties>;

  public constructor(properties: PaymentRefundProperties) {
    if (!Number.isSafeInteger(properties.amountCents) || properties.amountCents < 0) {
      throw new Error('Payment refund amountCents must be a non-negative safe integer');
    }
    if (properties.amountCents === 0) {
      throw new Error('Payment refund amountCents must be greater than zero');
    }
    if (!/^[A-Z]{3}$/.test(properties.currency)) {
      throw new Error('Payment refund currency must be an ISO 4217 alpha-3 code');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Payment refund updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
