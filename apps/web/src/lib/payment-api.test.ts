import { describe, it, expect, vi } from 'vitest';
import { PaymentApiClient, safePaymentMessage } from './payment-api';

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

  function getHeaders(mock: ReturnType<typeof vi.fn>): Record<string, string> {
    const call = mock.mock.calls[0] as [string, { headers?: Record<string, string> }] | undefined;
    return call?.[1]?.headers ?? {};
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

      const client = createClient(fetchMock);
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
          }) as Record<string, string>,
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

      const client = createClient(fetchMock);
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

      const client = createClient(fetchMock);
      const result = await client.readPaymentByOrder('order-001');

      expect(result.orderId).toBe('order-001');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/payments/order/order-001',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('adminGetPaymentDetail', () => {
    it('sends GET /admin/payments/:paymentId', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { payment: { paymentId: 'pay-admin', state: 'CAPTURED' } },
          }),
      });

      const client = createClient(fetchMock);
      const result = await client.adminGetPaymentDetail('pay-admin');

      expect(result.paymentId).toBe('pay-admin');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/admin/payments/pay-admin',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('adminInitiateRefund', () => {
    it('sends POST /admin/payments/:paymentId/refund', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              mutation: {
                paymentId: 'pay-001',
                orderId: 'order-001',
                state: 'REFUND_PENDING',
                providerOrderId: null,
                version: 2,
              },
            },
          }),
      });

      const client = createClient(fetchMock);
      const result = await client.adminInitiateRefund('pay-001', {
        amountCents: 1000,
        reasonReference: 'defective',
      });

      expect(result.paymentId).toBe('pay-001');
      expect(result.state).toBe('REFUND_PENDING');
    });
  });

  describe('error handling', () => {
    it('throws UNAUTHORIZED for 401', async () => {
      const client = createClient(vi.fn().mockResolvedValue({ ok: false, status: 401 }));
      await expect(client.readPayment('x')).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
    });

    it('throws ACCESS_DENIED for 403', async () => {
      const client = createClient(vi.fn().mockResolvedValue({ ok: false, status: 403 }));
      await expect(client.readPayment('x')).rejects.toMatchObject({ kind: 'ACCESS_DENIED' });
    });

    it('throws NOT_FOUND for 404', async () => {
      const client = createClient(vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      await expect(client.readPayment('x')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });

    it('throws CONFLICT for 409', async () => {
      const client = createClient(vi.fn().mockResolvedValue({ ok: false, status: 409 }));
      await expect(client.readPayment('x')).rejects.toMatchObject({ kind: 'CONFLICT' });
    });

    it('throws RATE_LIMITED for 429', async () => {
      const client = createClient(vi.fn().mockResolvedValue({ ok: false, status: 429 }));
      await expect(client.readPayment('x')).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
    });

    it('throws VALIDATION for 400', async () => {
      const client = createClient(vi.fn().mockResolvedValue({ ok: false, status: 400 }));
      await expect(client.readPayment('x')).rejects.toMatchObject({ kind: 'VALIDATION' });
    });

    it('throws SERVER for unexpected status', async () => {
      const client = createClient(vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await expect(client.readPayment('x')).rejects.toMatchObject({ kind: 'SERVER' });
    });

    it('throws NETWORK for fetch failure', async () => {
      const client = createClient(vi.fn().mockRejectedValue(new Error('network')));
      await expect(client.readPayment('x')).rejects.toMatchObject({ kind: 'NETWORK' });
    });

    it('throws SERVER when response has no data', async () => {
      const client = createClient(
        vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
      );
      await expect(client.readPayment('x')).rejects.toMatchObject({ kind: 'SERVER' });
    });
  });

  describe('constructor options', () => {
    it('strips trailing slash from baseUrl', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { payment: { paymentId: 'p1' } } }),
      });
      const client = createClient(fetchMock, { baseUrl: 'https://api.example.com/api/v1/' });
      await client.readPayment('p1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/payments/p1',
        expect.anything(),
      );
    });

    it('sends request without Authorization when token is null', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { payment: { paymentId: 'p1' } } }),
      });
      const client = createClient(fetchMock, { getAccessToken: () => null });
      await client.readPayment('p1');
      const headers = getHeaders(fetchMock);
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('sends request without Authorization when token is empty', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { payment: { paymentId: 'p1' } } }),
      });
      const client = createClient(fetchMock, { getAccessToken: () => '' });
      await client.readPayment('p1');
      const headers = getHeaders(fetchMock);
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('does not set Content-Type for GET requests', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { payment: { paymentId: 'p1' } } }),
      });
      const client = createClient(fetchMock);
      await client.readPayment('p1');
      const headers = getHeaders(fetchMock);
      expect(headers).not.toHaveProperty('Content-Type');
    });

    it('generates a UUID idempotency key by default', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { payment: { paymentId: 'p1' } } }),
      });
      const client = new PaymentApiClient({
        baseUrl: 'https://api.example.com/api/v1',
        fetchImpl: fetchMock,
      });
      await client.initiatePayment({ orderId: 'order-001' });
      const headers = getHeaders(fetchMock);
      expect(headers['Idempotency-Key']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });
});

describe('safePaymentMessage', () => {
  it('returns safe messages for all error kinds', () => {
    expect(safePaymentMessage('UNAUTHORIZED')).toContain('session');
    expect(safePaymentMessage('ACCESS_DENIED')).toContain('permission');
    expect(safePaymentMessage('NOT_FOUND')).toContain('payment');
    expect(safePaymentMessage('CONFLICT')).toContain('conflicts');
    expect(safePaymentMessage('RATE_LIMITED')).toContain('requests');
    expect(safePaymentMessage('VALIDATION')).toContain('details');
    expect(safePaymentMessage('NETWORK')).toContain('unreachable');
    expect(safePaymentMessage('SERVER')).toContain('unexpected');
  });
});
