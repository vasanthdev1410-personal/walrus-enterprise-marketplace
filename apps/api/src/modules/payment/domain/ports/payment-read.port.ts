import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M09-PLAN-001 M09-M1. Read-only port for consuming payment data
 * from other modules (M08 Orders, M10 Shipping). The M08 order lifecycle
 * needs to check payment status before transitioning orders. This port
 * provides a minimal, non-mutating view of payment state.
 *
 * Port-only in M09-M1; the adapter is implemented in M09-M2/M03.
 */
export interface PaymentReadPort {
  /** Find the payment for an order, or null if none exists. */
  findByOrderId(orderId: UuidV7): Promise<PaymentStatus | null>;
}

export interface PaymentStatus {
  readonly paymentId: string;
  readonly orderId: string;
  readonly state: string;
  readonly amountCents: number;
  readonly currency: string;
}
