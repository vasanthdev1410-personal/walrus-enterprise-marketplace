import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M09-PLAN-001 M09-M3 (decision D-05). Minimal, fail-closed order
 * facts for Module 09 payment processing. Only PENDING orders resolve
 * to facts for payment initiation; other states may be read for
 * validation. Null means the order is unknown or inaccessible (fail closed).
 */
export interface OrderPaymentFacts {
  readonly orderId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly state: string;
  readonly subtotalAmountCents: number;
  readonly subtotalCurrency: string;
  readonly aggregateVersion: number;
}

export interface OrderReadPort {
  /** Read minimal order facts for payment processing. */
  readOrderFacts(orderId: UuidV7): Promise<OrderPaymentFacts | null>;
}
