import { createHmac } from 'node:crypto';
import { RazorpayPaymentProviderAdapter } from './razorpay-payment-provider.adapter';
import { PaymentDomainError } from '../../domain/errors/payment-domain.error';

/**
 * WEMP-M09-PLAN-001 M09-M3. Tests for the RazorpayPaymentProviderAdapter.
 */
describe('RazorpayPaymentProviderAdapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('verifyWebhookSignature', () => {
    it('returns true for valid signature', () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
      const adapter = new RazorpayPaymentProviderAdapter();
      const payload = '{"event":"payment.captured"}';
      const signature = createHmac('sha256', 'test_webhook_secret')
        .update(payload, 'utf8')
        .digest('hex');

      expect(adapter.verifyWebhookSignature(payload, signature)).toBe(true);
    });

    it('returns false for invalid signature', () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
      const adapter = new RazorpayPaymentProviderAdapter();
      const payload = '{"event":"payment.captured"}';

      expect(adapter.verifyWebhookSignature(payload, 'invalid_signature')).toBe(false);
    });

    it('returns false when webhook secret is not configured', () => {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      const adapter = new RazorpayPaymentProviderAdapter();

      expect(adapter.verifyWebhookSignature('payload', 'signature')).toBe(false);
    });

    it('returns false for empty payload', () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
      const adapter = new RazorpayPaymentProviderAdapter();

      expect(adapter.verifyWebhookSignature('', 'signature')).toBe(false);
    });

    it('returns false for empty signature', () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
      const adapter = new RazorpayPaymentProviderAdapter();

      expect(adapter.verifyWebhookSignature('payload', '')).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('parses payment.captured event', () => {
      process.env.RAZORPAY_KEY_ID = 'test_key';
      process.env.RAZORPAY_KEY_SECRET = 'test_secret';
      const adapter = new RazorpayPaymentProviderAdapter();

      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_001',
              order_id: 'order_rzp_001',
              amount: 1000,
            },
          },
        },
      });

      const event = adapter.parseWebhookEvent(payload);
      expect(event.eventType).toBe('payment.captured');
      expect(event.providerPaymentId).toBe('pay_rzp_001');
      expect(event.providerOrderId).toBe('order_rzp_001');
      expect(event.amountCents).toBe(1000);
    });

    it('parses refund.created event', () => {
      process.env.RAZORPAY_KEY_ID = 'test_key';
      process.env.RAZORPAY_KEY_SECRET = 'test_secret';
      const adapter = new RazorpayPaymentProviderAdapter();

      const payload = JSON.stringify({
        event: 'refund.created',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_001',
              payment_id: 'pay_rzp_001',
              amount: 500,
            },
          },
        },
      });

      const event = adapter.parseWebhookEvent(payload);
      expect(event.eventType).toBe('refund.created');
      expect(event.providerRefundId).toBe('rfnd_001');
    });

    it('throws PAYMENT_PROVIDER_ERROR for invalid JSON', () => {
      process.env.RAZORPAY_KEY_ID = 'test_key';
      process.env.RAZORPAY_KEY_SECRET = 'test_secret';
      const adapter = new RazorpayPaymentProviderAdapter();

      expect(() => adapter.parseWebhookEvent('not json')).toThrow(PaymentDomainError);
    });

    it('throws PAYMENT_PROVIDER_ERROR for non-object payload', () => {
      process.env.RAZORPAY_KEY_ID = 'test_key';
      process.env.RAZORPAY_KEY_SECRET = 'test_secret';
      const adapter = new RazorpayPaymentProviderAdapter();

      expect(() => adapter.parseWebhookEvent('"string"')).toThrow(PaymentDomainError);
    });
  });

  describe('createProviderOrder', () => {
    it('throws PAYMENT_PROVIDER_ERROR when not configured', async () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      const adapter = new RazorpayPaymentProviderAdapter();

      await expect(
        adapter.createProviderOrder({
          receiptId: 'receipt_001',
          amountCents: 1000,
          currency: 'INR',
        }),
      ).rejects.toThrow('PAYMENT_PROVIDER_ERROR');
    });

    it('throws PAYMENT_PROVIDER_ERROR even when configured (stub)', async () => {
      process.env.RAZORPAY_KEY_ID = 'test_key';
      process.env.RAZORPAY_KEY_SECRET = 'test_secret';
      const adapter = new RazorpayPaymentProviderAdapter();

      await expect(
        adapter.createProviderOrder({
          receiptId: 'receipt_001',
          amountCents: 1000,
          currency: 'INR',
        }),
      ).rejects.toThrow('PAYMENT_PROVIDER_ERROR');
    });
  });

  describe('initiateRefund', () => {
    it('throws PAYMENT_PROVIDER_ERROR when not configured', async () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      const adapter = new RazorpayPaymentProviderAdapter();

      await expect(
        adapter.initiateRefund({
          providerPaymentId: 'pay_rzp_001',
          amountCents: 500,
          receiptId: 'receipt_001',
        }),
      ).rejects.toThrow('PAYMENT_PROVIDER_ERROR');
    });
  });
});
