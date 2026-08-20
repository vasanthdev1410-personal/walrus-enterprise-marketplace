import { describe, it, expect, vi } from 'vitest';
import { PaymentApiClient, PaymentApiError, safePaymentMessage } from './payment-api';

describe('PaymentApiClient', () => {
  function createClient(
    fetchImpl: typeof fetch,
    options: { baseUrl?: string; getAccessToken?: () => string | null } = {},
  ): PaymentApiClient {
    return new PaymentApiClient({
      baseUrl: options.baseUrl ?? 'https://api.example.com/api/v1',
      getAccessToken: options.getAccessToken ?? (() => 'test-token'),
      fetchImpl,
      idempotencyKeyFactory: () => 'test-idempotency-key',
    });
  }

  describe('initiatePayment', () => {
    it('sends POST /payments with Idempotency-Key', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              payment: {
                paymentId: 'pay-001',
                orderId: 'order-001',
                state: 'PROCESSING',
              },
            },
          }),
      });

      const client = createClient(fetchMock as unknown as typeof fetch);
      const result = await client.initiatePayment({ orderId: 'order-001' });

      expect(result.paymentId).toBe('pay-001');
      expect(result.state).toBe('PROCESSING');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/payments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': 'test-idempotency-key',
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });
  });

  describe('readPayment', () => {
    it('sends GET /payments/:paymentId', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              payment: { paymentId: 'pay-001', state: 'CAPTURED' },
            },
          }),
      });

      const client = createClient(fetchMock as unknown as typeof fetch);
      const result = await client.readPayment('pay-001');

      expect(result.paymentId).toBe('pay-001');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/payments/pay-001',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('readPaymentByOrder', () => {
    it('sends GET /payments/order/:orderId', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              payment: { paymentId: 'pay-001', orderId: 'order-001' },
            },
          }),
      });

      const client = createClient(fetchMock as unknown as typeof fetch);
      const result = await client.readPaymentByOrder('order-001');

      expect(result.orderId).toBe('order-001');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/payments/order/order-001',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('error handling', () => {
    it('throws NOT_FOUND for 404', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const client = createClient(fetchMock as unknown as typeof fetch);
      await expect(client.readPayment('nonexistent')).rejects.toThrow(PaymentApiError);
      await expect(client.readPayment('nonexistent')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });

    it('throws NETWORK for fetch failure', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('network'));

      const client = createClient(fetchMock as unknown as typeof fetch);
      await expect(client.readPayment('pay-001')).rejects.toMatchObject({ kind: 'NETWORK' });
    });
  });
});

describe('safePaymentMessage', () => {
  it('returns safe messages for all error kinds', () => {
    expect(safePaymentMessage('UNAUTHORIZED')).toContain('session');
    expect(safePaymentMessage('NOT_FOUND')).toContain('payment');
    expect(safePaymentMessage('CONFLICT')).toContain('conflicts');
    expect(safePaymentMessage('NETWORK')).toContain('unreachable');
    expect(safePaymentMessage('SERVER')).toContain('unexpected');
  });
});
