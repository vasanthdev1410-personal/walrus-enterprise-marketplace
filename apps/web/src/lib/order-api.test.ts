import { describe, expect, it, vi } from 'vitest';
import { OrderApiClient } from './order-api';
import type { OrderApiClientOptions } from './order-api';

function createClient(
  fetchImpl: typeof fetch,
  options: Omit<OrderApiClientOptions, 'fetchImpl'> = {},
): OrderApiClient {
  return new OrderApiClient({ fetchImpl, ...options });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ORDER = {
  orderId: '0191310f-789a-7123-8123-000000000010',
  customerProfileId: '0191310f-789a-7123-8123-000000000003',
  snapshotId: '0191310f-789a-7123-8123-000000000050',
  cartId: '0191310f-789a-7123-8123-000000000060',
  state: 'PENDING',
  totalLines: 2,
  totalItems: 5,
  subtotalAmountCents: 9995,
  subtotalCurrency: 'USD',
  version: 1,
  lines: [
    {
      orderLineId: '0191310f-789a-7123-8123-000000000020',
      cartLineId: '0191310f-789a-7123-8123-000000000025',
      skuId: '0191310f-789a-7123-8123-000000000030',
      productId: '0191310f-789a-7123-8123-000000000040',
      skuCode: 'SKU-001',
      quantity: 3,
      unitPriceAmount: 1999,
      unitPriceCurrency: 'USD',
      snapshotTaxIncluded: true,
      revalidated: true,
    },
  ],
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

const MUTATION = {
  orderId: '0191310f-789a-7123-8123-000000000010',
  state: 'CANCELLED',
  totalLines: 2,
  totalItems: 5,
  version: 2,
};

describe('OrderApiClient', () => {
  it('reads an order from the success envelope', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { order: ORDER }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.readOrder(ORDER.orderId);
    expect(result.orderId).toBe(ORDER.orderId);
    expect(result.lines).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/orders/${ORDER.orderId}`);
    expect(init.method).toBe('GET');
  });

  it('sends the bearer token when a session exists', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { order: ORDER }, correlationId: 'c1' }));
    const client = createClient(fetchImpl, { getAccessToken: () => 'token-abc' });
    await client.readOrder(ORDER.orderId);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
  });

  it('omits the bearer header when no session exists (server decides access)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { order: ORDER }, correlationId: 'c1' }));
    const client = createClient(fetchImpl, { getAccessToken: () => null });
    await client.readOrder(ORDER.orderId);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('carries an Idempotency-Key on createOrder', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { data: { order: ORDER }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await client.createOrder({ snapshotId: ORDER.snapshotId });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('routes createOrder to POST /orders', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { data: { order: ORDER }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await client.createOrder({ snapshotId: ORDER.snapshotId });
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/orders');
  });

  it('routes listOrders to GET /orders', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { orders: [ORDER] }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.listOrders();
    expect(result).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/orders');
    expect(init.method).toBe('GET');
  });

  it('routes cancelOrder to DELETE /orders/:orderId', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { mutation: MUTATION }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.cancelOrder(ORDER.orderId, {
      expectedVersion: 1,
      reasonReference: 'CUSTOMER_CANCEL',
    });
    expect(result.version).toBe(MUTATION.version);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/orders/${ORDER.orderId}`);
    expect(init.method).toBe('DELETE');
  });

  it('routes adminGetOrderDetail to GET /admin/orders/:orderId', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { order: ORDER }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.adminGetOrderDetail(ORDER.orderId);
    expect(result.orderId).toBe(ORDER.orderId);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/admin/orders/${ORDER.orderId}`);
    expect(init.method).toBe('GET');
  });

  it('routes adminTransitionOrder to POST /admin/orders/:orderId/transition', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { mutation: MUTATION }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.adminTransitionOrder(ORDER.orderId, {
      toState: 'CONFIRMED',
      reasonReference: 'PAYMENT_INITIATED',
    });
    expect(result.version).toBe(MUTATION.version);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/admin/orders/${ORDER.orderId}/transition`);
    expect(init.method).toBe('POST');
  });

  it('maps 401 to UNAUTHORIZED with a safe session-expired message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(401, {
        success: false,
        message: 'AUTHENTICATION_ASSURANCE_INSUFFICIENT',
        errorCode: 'VALIDATION_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.readOrder(ORDER.orderId)).rejects.toMatchObject({
      kind: 'UNAUTHORIZED',
      message: 'Your session has expired. Sign in again to continue.',
    });
  });

  it('maps 403 to ACCESS_DENIED without revealing authorization details', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(403, {
        success: false,
        message: 'AUTHORIZATION_DENIED',
        errorCode: 'UNEXPECTED_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.readOrder(ORDER.orderId)).rejects.toMatchObject({ kind: 'ACCESS_DENIED' });
  });

  it('maps 404 to NOT_FOUND (non-enumerating)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(404, {
        success: false,
        message: 'ORDER_NOT_FOUND',
        errorCode: 'RESOURCE_NOT_FOUND',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.readOrder(ORDER.orderId)).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it('maps 409 to CONFLICT (state conflict)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        success: false,
        message: 'ORDER_STALE_VERSION',
        errorCode: 'UNEXPECTED_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(
      client.cancelOrder(ORDER.orderId, { expectedVersion: 1, reasonReference: 'TEST' }),
    ).rejects.toMatchObject({ kind: 'CONFLICT' });
  });

  it('maps 429 to RATE_LIMITED (D-10)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(429, {
        success: false,
        message: 'RATE_LIMIT_EXCEEDED',
        errorCode: 'RATE_LIMIT_EXCEEDED',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.readOrder(ORDER.orderId)).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
  });

  it('maps 400 to VALIDATION (DTO allow-listing)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        success: false,
        message: 'ORDER_VALIDATION_FAILED',
        errorCode: 'VALIDATION_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.createOrder({ snapshotId: ORDER.snapshotId })).rejects.toMatchObject({
      kind: 'VALIDATION',
    });
  });

  it('fails closed on a malformed success envelope', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: 'unexpected', correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await expect(client.readOrder(ORDER.orderId)).rejects.toMatchObject({ kind: 'SERVER' });
  });

  it('maps network failures to NETWORK', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createClient(fetchImpl);
    await expect(client.readOrder(ORDER.orderId)).rejects.toMatchObject({ kind: 'NETWORK' });
  });
});
