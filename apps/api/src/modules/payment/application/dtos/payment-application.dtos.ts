/**
 * WEMP-M09-PLAN-001 M09-M3. Application-layer DTOs for the payment module:
 * command objects for mutations, query objects for reads, and result objects
 * returned by the application service. These are the API-level contracts
 * that M09-M5 controllers will consume; the application service translates
 * between DTOs and domain entities.
 */
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { PaymentState } from '../../domain/value-objects/payment-state';

// ---------------------------------------------------------------------------
// Commands (mutations)
// ---------------------------------------------------------------------------

/** Initiate a payment for an order (customer self-service). */
export interface InitiatePaymentCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly orderId: UuidV7;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

/** Process a provider webhook event (system actor). */
export interface ProcessWebhookCommand {
  readonly rawPayload: string;
  readonly signatureHeader: string;
  readonly actorIdentityId: UuidV7;
  readonly correlationId?: CorrelationIdentifier;
}

/** Initiate a refund on a captured payment (admin actor). */
export interface InitiateRefundCommand {
  readonly actorIdentityId: UuidV7;
  readonly paymentId: UuidV7;
  readonly amountCents: number;
  readonly reasonReference: string;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Read a single payment by ID. */
export interface ReadPaymentQuery {
  readonly paymentId: UuidV7;
  readonly callerIdentityId: UuidV7;
}

/** Read the payment for an order. */
export interface ReadPaymentByOrderQuery {
  readonly orderId: UuidV7;
  readonly callerIdentityId: UuidV7;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface PaymentAttemptResult {
  readonly paymentAttemptId: string;
  readonly providerPaymentId: string | null;
  readonly outcome: string;
  readonly attemptedAt: string;
}

export interface PaymentRefundResult {
  readonly paymentRefundId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly state: string;
  readonly providerRefundId: string | null;
}

export interface PaymentResult {
  readonly paymentId: string;
  readonly orderId: string;
  readonly customerProfileId: string;
  readonly state: PaymentState;
  readonly amountCents: number;
  readonly currency: string;
  readonly provider: string;
  readonly providerOrderId: string | null;
  readonly providerPaymentId: string | null;
  readonly idempotencyKey: string;
  readonly version: number;
  readonly attempts: readonly PaymentAttemptResult[];
  readonly refunds: readonly PaymentRefundResult[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PaymentMutationResult {
  readonly paymentId: string;
  readonly orderId: string;
  readonly state: PaymentState;
  readonly providerOrderId: string | null;
  readonly version: number;
}

export interface WebhookProcessResult {
  readonly paymentId: string;
  readonly orderId: string;
  readonly newState: PaymentState;
  readonly orderTransitioned: boolean;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

import type { Payment } from '../../domain/entities/payment';
import type { PaymentAttempt } from '../../domain/entities/payment-attempt';
import type { PaymentRefund } from '../../domain/entities/payment-refund';

export function toPaymentAttemptResult(attempt: PaymentAttempt): PaymentAttemptResult {
  const p = attempt.properties;
  return {
    paymentAttemptId: p.paymentAttemptId.value,
    providerPaymentId: p.providerPaymentId,
    outcome: p.outcome,
    attemptedAt: p.attemptedAt.toISOString(),
  };
}

export function toPaymentRefundResult(refund: PaymentRefund): PaymentRefundResult {
  const p = refund.properties;
  return {
    paymentRefundId: p.paymentRefundId.value,
    amountCents: p.amountCents,
    currency: p.currency,
    state: p.state,
    providerRefundId: p.providerRefundId,
  };
}

export function toPaymentResult(
  payment: Payment,
  attempts: readonly PaymentAttempt[],
  refunds: readonly PaymentRefund[],
): PaymentResult {
  const p = payment.properties;
  return {
    paymentId: p.paymentId.value,
    orderId: p.orderId.value,
    customerProfileId: p.customerProfileId.value,
    state: p.state,
    amountCents: p.amountCents,
    currency: p.currency,
    provider: p.provider,
    providerOrderId: p.providerOrderId,
    providerPaymentId: p.providerPaymentId,
    idempotencyKey: p.idempotencyKey,
    version: p.aggregateVersion.value,
    attempts: attempts.map(toPaymentAttemptResult),
    refunds: refunds.map(toPaymentRefundResult),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toPaymentMutationResult(payment: Payment): PaymentMutationResult {
  const p = payment.properties;
  return {
    paymentId: p.paymentId.value,
    orderId: p.orderId.value,
    state: p.state,
    providerOrderId: p.providerOrderId,
    version: p.aggregateVersion.value,
  };
}
