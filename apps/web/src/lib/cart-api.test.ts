import { describe, expect, it, vi } from 'vitest';
import { CartApiClient } from './cart-api';
import type { CartApiClientOptions } from './cart-api';

function createClient(
  fetchImpl: typeof fetch,
  options: Omit<CartApiClientOptions, 'fetchImpl'> = {},
): CartApiClient {
  return new CartApiClient({ fetchImpl, ...options });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CART = {
  cartId: '0191310f-789a-7123-8123-000000000010',
  customerProfileId: '0191310f-789a-7123-8123-000000000003',
  state: 'ACTIVE',
  totalLines: 2,
  totalItems: 5,
  version: 3,
  lines: [
    {
      cartLineId: '0191310f-789a-7123-8123-000000000020',
      skuId: '0191310f-789a-7123-8123-000000000030',
      productId: '0191310f-789a-7123-8123-000000000040',
      skuCode: 'SKU-001',
      quantity: 3,
      unitPriceAmount: 1999,
      unitPriceCurrency: 'USD',
      snapshotTaxIncluded: true,
      productUnavailable: false,
    },
  ],
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
};

const MUTATION = {
  cartId: '0191310f-789a-7123-8123-000000000010',
  state: 'ACTIVE',
  totalLines: 2,
  totalItems: 5,
  version: 4,
};

describe('CartApiClient', () => {
  it('reads the own cart from the success envelope', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { cart: CART }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.getCart();
    expect(result.cartId).toBe(CART.cartId);
    expect(result.lines).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/cart');
    expect(init.method).toBe('GET');
  });

  it('sends the bearer token when a session exists', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { cart: CART }, correlationId: 'c1' }));
    const client = createClient(fetchImpl, { getAccessToken: () => 'token-abc' });
    await client.getCart();
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
  });

  it('omits the bearer header when no session exists (server decides access)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { cart: CART }, correlationId: 'c1' }));
    const client = createClient(fetchImpl, { getAccessToken: () => null });
    await client.getCart();
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('carries an Idempotency-Key on addItem', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { data: { cart: CART }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await client.addItem({
      skuId: '0191310f-789a-7123-8123-000000000030',
      productId: '0191310f-789a-7123-8123-000000000040',
      skuCode: 'SKU-001',
      quantity: 1,
      expectedVersion: 2,
    });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('routes addItem to POST /cart/items', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { data: { cart: CART }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await client.addItem({
      skuId: '0191310f-789a-7123-8123-000000000030',
      productId: '0191310f-789a-7123-8123-000000000040',
      skuCode: 'SKU-001',
      quantity: 1,
      expectedVersion: 2,
    });
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/cart/items');
  });

  it('routes updateItemQuantity to PATCH /cart/items/:cartLineId', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { mutation: MUTATION }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await client.updateItemQuantity('0191310f-789a-7123-8123-000000000020', {
      quantity: 5,
      expectedVersion: 3,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/cart/items/0191310f-789a-7123-8123-000000000020');
    expect(init.method).toBe('PATCH');
  });

  it('routes removeItem to DELETE /cart/items/:cartLineId', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { mutation: MUTATION }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await client.removeItem('0191310f-789a-7123-8123-000000000020', { expectedVersion: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/cart/items/0191310f-789a-7123-8123-000000000020');
    expect(init.method).toBe('DELETE');
  });

  it('routes clearCart to POST /cart/clear', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { mutation: MUTATION }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await client.clearCart({ expectedVersion: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/cart/clear');
    expect(init.method).toBe('POST');
  });

  it('routes checkoutHandoff to POST /cart/checkout', async () => {
    const checkout = {
      cartId: '0191310f-789a-7123-8123-000000000010',
      snapshotId: '0191310f-789a-7123-8123-000000000050',
      totalLines: 2,
      totalItems: 5,
      subtotalAmountCents: 9995,
      subtotalCurrency: 'USD',
      version: 5,
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { checkout }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.checkoutHandoff({ expectedVersion: 4 });
    expect(result.snapshotId).toBe(checkout.snapshotId);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/cart/checkout');
    expect(init.method).toBe('POST');
  });

  it('routes adminGetCartDetail to GET /admin/carts/:cartId', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { cartId: CART.cartId }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.adminGetCartDetail(CART.cartId);
    expect(result.cartId).toBe(CART.cartId);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/admin/carts/${CART.cartId}`);
    expect(init.method).toBe('GET');
  });

  it('routes adminExpireCart to POST /admin/carts/:cartId/expire', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { mutation: MUTATION }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.adminExpireCart(CART.cartId, {
      reasonReference: 'ADMIN_EXPIRE_001',
    });
    expect(result.version).toBe(MUTATION.version);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/admin/carts/${CART.cartId}/expire`);
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
    await expect(client.getCart()).rejects.toMatchObject({
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
    await expect(client.getCart()).rejects.toMatchObject({ kind: 'ACCESS_DENIED' });
  });

  it('maps 404 to NOT_FOUND (non-enumerating)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(404, {
        success: false,
        message: 'CART_NOT_FOUND',
        errorCode: 'RESOURCE_NOT_FOUND',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.getCart()).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it('maps 409 to CONFLICT (state conflict)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        success: false,
        message: 'CART_STALE_VERSION',
        errorCode: 'UNEXPECTED_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.clearCart({ expectedVersion: 1 })).rejects.toMatchObject({
      kind: 'CONFLICT',
    });
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
    await expect(client.getCart()).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
  });

  it('maps 400 to VALIDATION (DTO allow-listing)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        success: false,
        message: 'CART_VALIDATION_FAILED',
        errorCode: 'VALIDATION_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(
      client.addItem({
        skuId: '0191310f-789a-7123-8123-000000000030',
        productId: '0191310f-789a-7123-8123-000000000040',
        skuCode: 'SKU-001',
        quantity: 1,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ kind: 'VALIDATION' });
  });

  it('fails closed on a malformed success envelope', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: 'unexpected', correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await expect(client.getCart()).rejects.toMatchObject({ kind: 'SERVER' });
  });

  it('maps network failures to NETWORK', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createClient(fetchImpl);
    await expect(client.getCart()).rejects.toMatchObject({ kind: 'NETWORK' });
  });
});
