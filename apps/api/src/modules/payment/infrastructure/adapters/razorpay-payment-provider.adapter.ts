import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type PaymentProviderPort,
  type CreateProviderOrderRequest,
  type ProviderOrderResult,
  type PaymentWebhookEvent,
  type InitiateRefundRequest,
  type ProviderRefundResult,
} from '../../domain/ports/payment-provider.port';
import { PaymentDomainError } from '../../domain/errors/payment-domain.error';

/**
 * WEMP-M09-PLAN-001 M09-M3. Razorpay payment provider adapter implementing
 * the PaymentProviderPort. Fail closed: when Razorpay credentials are not
 * configured, all operations throw PAYMENT_PROVIDER_ERROR. Webhook signature
 * verification uses HMAC-SHA256 with the configured webhook secret — fail
 * closed on any verification error (returns false).
 */
export class RazorpayPaymentProviderAdapter implements PaymentProviderPort {
  private readonly keyId: string | undefined;
  private readonly keySecret: string | undefined;
  private readonly webhookSecret: string | undefined;

  public constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID;
    this.keySecret = process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  }

  private assertConfigured(): void {
    if (!this.keyId || !this.keySecret) {
      throw new PaymentDomainError('PAYMENT_PROVIDER_ERROR');
    }
  }

  public async createProviderOrder(
    request: CreateProviderOrderRequest,
  ): Promise<ProviderOrderResult> {
    this.assertConfigured();
    void request;
    await Promise.resolve();
    throw new PaymentDomainError('PAYMENT_PROVIDER_ERROR');
  }

  public verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      return false;
    }
    if (payload.length === 0 || signature.length === 0) {
      return false;
    }

    try {
      const expectedSignature = createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      const sigBuffer = Buffer.from(signature, 'utf8');
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  public parseWebhookEvent(payload: string): PaymentWebhookEvent {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new PaymentDomainError('PAYMENT_PROVIDER_ERROR');
      }

      const event = parsed as Record<string, unknown>;
      const eventType = typeof event.event === 'string' ? event.event : '';

      // Razorpay structure: { event, payload: { payment: { entity: {...} } } }
      const payloadObj = getNestedObj(event, 'payload');
      const paymentObj = payloadObj !== null ? getNestedObj(payloadObj, 'payment') : null;
      const entity = paymentObj !== null ? getNestedObj(paymentObj, 'entity') : null;

      const providerPaymentId = getString(entity, 'id');
      const providerOrderId = getString(entity, 'order_id');

      // Refund structure: { payload: { refund: { entity: {...} } } }
      const refundObj = payloadObj !== null ? getNestedObj(payloadObj, 'refund') : null;
      const refundEntity = refundObj !== null ? getNestedObj(refundObj, 'entity') : null;
      const providerRefundId = getString(refundEntity, 'id');

      const amountRaw = entity !== null ? entity.amount : undefined;
      const amountCents =
        typeof amountRaw === 'number'
          ? amountRaw
          : typeof amountRaw === 'string'
            ? Number(amountRaw)
            : null;

      return {
        eventType,
        providerPaymentId,
        providerOrderId,
        providerRefundId,
        amountCents: amountCents !== null && !Number.isNaN(amountCents) ? amountCents : null,
        rawPayloadDigest: '',
      };
    } catch {
      throw new PaymentDomainError('PAYMENT_PROVIDER_ERROR');
    }
  }

  public async initiateRefund(request: InitiateRefundRequest): Promise<ProviderRefundResult> {
    this.assertConfigured();
    void request;
    await Promise.resolve();
    throw new PaymentDomainError('PAYMENT_PROVIDER_ERROR');
  }
}

function getNestedObj(obj: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = obj[key];
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

function getString(obj: Record<string, unknown> | null, field: string): string | null {
  if (obj === null) {
    return null;
  }
  return typeof obj[field] === 'string' ? obj[field] : null;
}
