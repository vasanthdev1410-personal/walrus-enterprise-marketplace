/**
 * WEMP-M09-PLAN-001 M09-M1 (M09-SPEC-001). Port abstraction for the
 * payment provider (e.g. Razorpay). Module 09 never calls the provider
 * API directly — all provider interactions go through this port. The
 * M09-M3 milestone provides the Razorpay adapter; until then the
 * production wiring fails closed (no adapter → denied).
 *
 * The port defines the minimal provider operations required by Module 09:
 * - Creating a provider-side order (for client-side checkout widget)
 * - Verifying webhook signatures (HMAC-SHA256)
 * - Parsing webhook events into a normalized structure
 * - Initiating refunds
 *
 * Provider-specific types (Razorpay order ID, payment ID, etc.) are
 * abstracted behind string identifiers — the domain never depends on
 * provider SDK types.
 */
export interface PaymentProviderPort {
  /** Create a provider-side order for the client checkout widget. */
  createProviderOrder(request: CreateProviderOrderRequest): Promise<ProviderOrderResult>;
  /** Verify a webhook payload signature. Fail closed on any error. */
  verifyWebhookSignature(payload: string, signature: string): boolean;
  /** Parse a raw webhook event into a normalized structure. */
  parseWebhookEvent(payload: string): PaymentWebhookEvent;
  /** Initiate a refund with the provider. */
  initiateRefund(request: InitiateRefundRequest): Promise<ProviderRefundResult>;
}

export interface CreateProviderOrderRequest {
  /** Our internal payment ID (used as receipt/reference). */
  receiptId: string;
  /** Amount in minor currency units (cents/paise). */
  amountCents: number;
  /** ISO 4217 currency code. */
  currency: string;
}

export interface ProviderOrderResult {
  /** Provider-side order ID (e.g. Razorpay order ID). */
  providerOrderId: string;
}

export interface PaymentWebhookEvent {
  /** Normalized event type (e.g. 'payment.captured', 'payment.failed'). */
  eventType: string;
  /** Provider-side payment ID, if present. */
  providerPaymentId: string | null;
  /** Provider-side order ID, if present. */
  providerOrderId: string | null;
  /** Provider-side refund ID, if present. */
  providerRefundId: string | null;
  /** Amount in minor currency units, if present. */
  amountCents: number | null;
  /** Raw event payload for audit (hashed before storage). */
  rawPayloadDigest: string;
}

export interface InitiateRefundRequest {
  /** Provider-side payment ID to refund. */
  providerPaymentId: string;
  /** Refund amount in minor currency units. */
  amountCents: number;
  /** Our internal payment ID (used as receipt/reference). */
  receiptId: string;
}

export interface ProviderRefundResult {
  /** Provider-side refund ID. */
  providerRefundId: string;
}
