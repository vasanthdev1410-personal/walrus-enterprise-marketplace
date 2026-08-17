import { describe, expect, it, vi } from 'vitest';
import { SellerApiClient } from './seller-api';
import type { SellerApiClientOptions } from './seller-api';

function createClient(
  fetchImpl: typeof fetch,
  options: Omit<SellerApiClientOptions, 'fetchImpl'> = {},
): SellerApiClient {
  return new SellerApiClient({ fetchImpl, ...options });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SellerApiClient', () => {
  it('parses the success envelope and returns the data section', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { seller: { state: 'DRAFT', version: 1 } },
        meta: { apiVersion: 'v1' },
        correlationId: 'corr-1',
      }),
    );
    const client = createClient(fetchImpl);
    const result = await client.createOnboarding({
      legalName: 'Walrus Retail',
      tradeName: 'Walrus',
      registrationNumber: 'GSTIN123',
      businessAddress: 'Addr',
    });
    expect(result).toEqual({ state: 'DRAFT', version: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/seller/onboarding');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    // Every mutation carries an Idempotency-Key.
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends the bearer token when a session exists', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { warehouses: [] }, correlationId: 'corr-1' }));
    const client = createClient(fetchImpl, { getAccessToken: () => 'token-abc' });
    await client.listWarehouses();
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
  });

  it('omits the bearer header when no session exists (server decides access)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { warehouses: [] }, correlationId: 'corr-1' }));
    const client = createClient(fetchImpl, { getAccessToken: () => null });
    await client.listWarehouses();
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
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
    await expect(client.getOnboardingStatus()).rejects.toMatchObject({
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
    await expect(client.getProfile()).rejects.toMatchObject({
      kind: 'ACCESS_DENIED',
      message: 'You do not have permission to perform this action.',
    });
  });

  it('maps 404 to NOT_FOUND (non-enumerating)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(404, {
        success: false,
        message: 'SELLER_NOT_FOUND',
        errorCode: 'RESOURCE_NOT_FOUND',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.getOnboardingStatus()).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it('maps 409 to CONFLICT (state conflict)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        success: false,
        message: 'SELLER_STATE_CONFLICT',
        errorCode: 'UNEXPECTED_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(
      client.submitOnboarding({
        sellerProfileId: '0191310f-789a-7123-8123-000000000001',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ kind: 'CONFLICT' });
  });

  it('maps 429 to RATE_LIMITED', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(429, {
        success: false,
        message: 'RATE_LIMIT_EXCEEDED',
        errorCode: 'UNEXPECTED_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.getVerificationStatus()).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
  });

  it('maps 5xx to SERVER with a generic message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(500, {
        success: false,
        message: 'An unexpected error occurred.',
        errorCode: 'UNEXPECTED_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.listAgreements()).rejects.toMatchObject({ kind: 'SERVER' });
  });

  it('maps a network failure to NETWORK without leaking details', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createClient(fetchImpl);
    await expect(client.listMembers()).rejects.toMatchObject({ kind: 'NETWORK' });
  });

  it('rejects a success envelope without a data section (fail closed)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { correlationId: 'corr-1' }));
    const client = createClient(fetchImpl);
    await expect(client.getBusiness()).rejects.toMatchObject({ kind: 'SERVER' });
  });

  it('appends the state filter on the admin list query', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { sellers: [] }, correlationId: 'corr-1' }));
    const client = createClient(fetchImpl);
    await client.listSellers('SUBMITTED');
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/sellers?state=SUBMITTED');
  });

  it('builds the warehouse close path from the validated identifier', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { data: { warehouse: { state: 'CLOSED' } }, correlationId: 'corr-1' }),
      );
    const client = createClient(fetchImpl);
    await client.closeWarehouse({
      warehouseId: '0191310f-789a-7123-8123-000000000005',
      expectedVersion: 5,
    });
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/seller/warehouses/0191310f-789a-7123-8123-000000000005/close');
  });

  it('uses a custom base URL when configured', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { agreements: [] }, correlationId: 'corr-1' }));
    const client = createClient(fetchImpl, { baseUrl: 'http://api.example.test/api/v1/' });
    await client.listAgreements();
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.example.test/api/v1/seller/agreements');
  });

  it('uses a custom idempotency-key factory for mutations', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { seller: { state: 'SUBMITTED', version: 2 } },
        correlationId: 'corr-1',
      }),
    );
    const client = createClient(fetchImpl, { idempotencyKeyFactory: () => 'custom-key-001' });
    await client.submitOnboarding({
      sellerProfileId: '0191310f-789a-7123-8123-000000000001',
      expectedVersion: 1,
    });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('custom-key-001');
  });

  it('reads the own profile through GET /seller/profile', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { profile: { sellerProfileId: 'id', state: 'ACTIVE' } },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.getProfile()).resolves.toMatchObject({ state: 'ACTIVE' });
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/seller/profile');
  });

  it('updates the profile and returns the new seller state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { seller: { state: 'DRAFT', version: 2 } },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await expect(
      client.updateProfile({ sellerProfileId: 'id', expectedVersion: 1, tradeName: 'New' }),
    ).resolves.toMatchObject({ state: 'DRAFT', version: 2 });
  });

  it('reads business information', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { business: { version: 1, legalName: 'L', tradeName: 'T', businessAddress: 'A' } },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.getBusiness()).resolves.toMatchObject({ legalName: 'L' });
  });

  it('updates business information', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { seller: { state: 'DRAFT', version: 2 } },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await expect(
      client.updateBusiness({ sellerProfileId: 'id', expectedVersion: 1, legalName: 'L2' }),
    ).resolves.toMatchObject({ version: 2 });
  });

  it('submits verification evidence references and digests only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { verification: { state: 'SUBMITTED', generation: 1 } },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    const result = await client.submitVerification({
      sellerProfileId: 'id',
      expectedVersion: 2,
      verificationType: 'GST',
      evidence: [
        {
          evidenceType: 'GST_CERTIFICATE',
          evidenceReference: 'ref:obj',
          evidenceDigest: 'a'.repeat(64),
        },
      ],
    });
    expect(result).toEqual({ state: 'SUBMITTED', generation: 1 });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.body).toContain('GST');
  });

  it('creates and closes warehouses', async () => {
    const create = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(201, { data: { warehouse: { state: 'ACTIVE' } }, correlationId: 'c1' }),
      );
    const createClientInstance = createClient(create);
    await expect(
      createClientInstance.createWarehouse({ expectedVersion: 5, name: 'W', address: 'A' }),
    ).resolves.toMatchObject({ state: 'ACTIVE' });

    const close = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { data: { warehouse: { state: 'CLOSED' } }, correlationId: 'c1' }),
      );
    const closeClient = createClient(close);
    await expect(
      closeClient.closeWarehouse({
        warehouseId: '0191310f-789a-7123-8123-000000000005',
        expectedVersion: 5,
      }),
    ).resolves.toMatchObject({ state: 'CLOSED' });
  });

  it('adds and removes members', async () => {
    const add = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: { member: { associationState: 'ACTIVE' } },
        correlationId: 'c1',
      }),
    );
    const addClient = createClient(add);
    await expect(
      addClient.addMember({
        expectedVersion: 5,
        memberIdentityId: '0191310f-789a-7123-8123-000000000006',
      }),
    ).resolves.toMatchObject({ associationState: 'ACTIVE' });

    const remove = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { member: { associationState: 'REMOVED' } },
        correlationId: 'c1',
      }),
    );
    const removeClient = createClient(remove);
    await expect(
      removeClient.removeMember({
        identityId: '0191310f-789a-7123-8123-000000000006',
        expectedVersion: 5,
      }),
    ).resolves.toMatchObject({ associationState: 'REMOVED' });
    const [url] = remove.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/seller/members/0191310f-789a-7123-8123-000000000006');
  });

  it('reads the seller detail for admins', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { seller: { sellerProfileId: 'id', state: 'SUBMITTED' } },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.getSellerDetail('id')).resolves.toMatchObject({ state: 'SUBMITTED' });
  });

  it('records admin review decisions (with and without a reason)', async () => {
    const approve = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { seller: { state: 'APPROVED', version: 3 } },
        correlationId: 'c1',
      }),
    );
    const approveClient = createClient(approve);
    await expect(
      approveClient.reviewSeller({ sellerProfileId: 'id', action: 'APPROVE', expectedVersion: 2 }),
    ).resolves.toMatchObject({ state: 'APPROVED' });

    const reject = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { seller: { state: 'REJECTED', version: 3 } },
        correlationId: 'c1',
      }),
    );
    const rejectClient = createClient(reject);
    await rejectClient.reviewSeller({
      sellerProfileId: 'id',
      action: 'REJECT',
      expectedVersion: 2,
      reasonReference: 'policy-001',
    });
    const [, init] = reject.mock.calls[0] as [string, RequestInit];
    expect(init.body).toContain('policy-001');
  });

  it('suspends and reactivates sellers with the mandatory reason', async () => {
    const suspend = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { seller: { state: 'SUSPENDED', version: 6 } },
        correlationId: 'c1',
      }),
    );
    const suspendClient = createClient(suspend);
    await expect(
      suspendClient.suspendSeller({
        sellerProfileId: 'id',
        expectedVersion: 5,
        reasonReference: 'abuse-001',
      }),
    ).resolves.toMatchObject({ state: 'SUSPENDED' });

    const reactivate = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { seller: { state: 'ACTIVE', version: 7 } },
        correlationId: 'c1',
      }),
    );
    const reactivateClient = createClient(reactivate);
    await expect(
      reactivateClient.reactivateSeller({ sellerProfileId: 'id', expectedVersion: 6 }),
    ).resolves.toMatchObject({ state: 'ACTIVE' });
  });

  it('reads evidence metadata (metadata only) for admins', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { evidence: [{ evidenceId: 'e1', evidenceType: 'GST_CERTIFICATE' }] },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.getEvidenceMetadata('id')).resolves.toHaveLength(1);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/sellers/id/evidence');
  });

  it('reads the own verification status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          verification: {
            sellerProfileId: 'id',
            complianceState: 'IN_PROGRESS',
            verifications: [],
          },
        },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.getVerificationStatus()).resolves.toMatchObject({
      complianceState: 'IN_PROGRESS',
    });
  });

  // ----- Module 04 product catalog -----

  it('lists own products with the sellerProfileId query scope', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { products: [] }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await client.listProducts('0191310f-789a-7123-8123-000000000003');
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      '/api/v1/seller/products?sellerProfileId=0191310f-789a-7123-8123-000000000003',
    );
  });

  it('reads the own product detail (variants, SKUs, media metadata)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          product: {
            productId: '0191310f-789a-7123-8123-000000000011',
            sellerProfileId: '0191310f-789a-7123-8123-000000000003',
            categoryId: '0191310f-789a-7123-8123-000000000005',
            name: 'Espresso machine',
            state: 'DRAFT',
            sellingPrice: 499.99,
            version: 1,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
            variants: [],
            skus: [{ skuId: 's1', skuCode: 'WLR-001', state: 'ACTIVE' }],
            media: [],
          },
        },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    const result = await client.getProductDetail(
      '0191310f-789a-7123-8123-000000000011',
      '0191310f-789a-7123-8123-000000000003',
    );
    expect(result.skus).toHaveLength(1);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      '/api/v1/seller/products/0191310f-789a-7123-8123-000000000011?sellerProfileId=0191310f-789a-7123-8123-000000000003',
    );
  });

  it('creates a product with skus and returns the mutation result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: { product: { productId: 'p1', state: 'DRAFT', version: 1 } },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    const result = await client.createProduct({
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      name: 'Espresso machine',
      categoryId: '0191310f-789a-7123-8123-000000000005',
      sellingPrice: 499.99,
      skus: [{ skuCode: 'WLR-001' }],
    });
    expect(result).toEqual({ productId: 'p1', state: 'DRAFT', version: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/seller/products');
    expect(init.method).toBe('POST');
    expect(init.body).toContain('WLR-001');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('updates a product without leaking the id into the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { product: { productId: 'p1', state: 'DRAFT', version: 2 } },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await client.updateProduct({
      productId: '0191310f-789a-7123-8123-000000000011',
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      expectedVersion: 1,
      name: 'Espresso machine v2',
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/seller/products/0191310f-789a-7123-8123-000000000011');
    expect(init.method).toBe('PATCH');
    expect(init.body).not.toContain('0191310f-789a-7123-8123-000000000011');
  });

  it('submits and closes own products (version-checked)', async () => {
    const submit = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { product: { productId: 'p1', state: 'SUBMITTED', version: 2 } },
        correlationId: 'c1',
      }),
    );
    const submitClient = createClient(submit);
    await expect(
      submitClient.submitProduct({
        productId: '0191310f-789a-7123-8123-000000000011',
        sellerProfileId: '0191310f-789a-7123-8123-000000000003',
        expectedVersion: 1,
      }),
    ).resolves.toMatchObject({ state: 'SUBMITTED' });
    const [submitUrl] = submit.mock.calls[0] as [string, RequestInit];
    expect(submitUrl).toContain('/submit');

    const close = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { product: { productId: 'p1', state: 'CLOSED', version: 3 } },
        correlationId: 'c1',
      }),
    );
    const closeClient = createClient(close);
    await closeClient.closeProduct({
      productId: '0191310f-789a-7123-8123-000000000011',
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      expectedVersion: 2,
      reasonReference: 'withdraw-001',
    });
    const [, closeInit] = close.mock.calls[0] as [string, RequestInit];
    expect(closeInit.body).toContain('withdraw-001');
  });

  it('adds variants and SKUs on own products', async () => {
    const variant = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: { variant: { variantId: 'v1', skuCode: 'WLR-001-SS', version: 1 } },
        correlationId: 'c1',
      }),
    );
    const variantClient = createClient(variant);
    await expect(
      variantClient.addVariant({
        productId: '0191310f-789a-7123-8123-000000000011',
        sellerProfileId: '0191310f-789a-7123-8123-000000000003',
        expectedVersion: 2,
        name: 'Stainless steel',
        sellingPrice: 549.99,
        skuCode: 'WLR-001-SS',
      }),
    ).resolves.toMatchObject({ skuCode: 'WLR-001-SS' });
    const [variantUrl] = variant.mock.calls[0] as [string, RequestInit];
    expect(variantUrl).toContain('/variants');

    const sku = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: { sku: { skuId: 's2', skuCode: 'WLR-001-SS-2', version: 1 } },
        correlationId: 'c1',
      }),
    );
    const skuClient = createClient(sku);
    await skuClient.addSku({
      productId: '0191310f-789a-7123-8123-000000000011',
      variantId: '0191310f-789a-7123-8123-000000000012',
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      expectedVersion: 2,
      skuCode: 'WLR-001-SS-2',
    });
    const [skuUrl] = sku.mock.calls[0] as [string, RequestInit];
    expect(skuUrl).toBe(
      '/api/v1/seller/products/0191310f-789a-7123-8123-000000000011/variants/0191310f-789a-7123-8123-000000000012/skus',
    );
  });

  it('closes a SKU and records media references (metadata only)', async () => {
    const close = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { sku: { skuId: 's2', skuCode: 'WLR-001-SS-2', version: 2 } },
        correlationId: 'c1',
      }),
    );
    const closeClient = createClient(close);
    await closeClient.closeSku({
      productId: '0191310f-789a-7123-8123-000000000011',
      skuId: '0191310f-789a-7123-8123-000000000014',
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      expectedVersion: 3,
    });
    const [closeUrl] = close.mock.calls[0] as [string, RequestInit];
    expect(closeUrl).toContain('/skus/0191310f-789a-7123-8123-000000000014/close');

    const media = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: { media: { mediaId: 'm1', productId: 'p1', version: 4 } },
        correlationId: 'c1',
      }),
    );
    const mediaClient = createClient(media);
    await mediaClient.recordMedia({
      productId: '0191310f-789a-7123-8123-000000000011',
      sellerProfileId: '0191310f-789a-7123-8123-000000000003',
      expectedVersion: 4,
      mediaReference: 'ref:obj:opaque',
      mediaDigest: 'a'.repeat(64),
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
    const [, mediaInit] = media.mock.calls[0] as [string, RequestInit];
    expect(mediaInit.body).toContain('image/jpeg');
  });

  it('lists product media metadata and platform categories', async () => {
    const mediaFetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          media: [
            {
              mediaId: 'm1',
              productId: 'p1',
              mediaType: 'PRODUCT_IMAGE',
              mediaReference: 'ref:obj:opaque',
              mediaDigest: 'a'.repeat(64),
              mimeType: 'image/jpeg',
              sizeBytes: 1024,
              uploadedByIdentityId: 'u1',
              state: 'ACTIVE',
              uploadedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        },
        correlationId: 'c1',
      }),
    );
    const client = createClient(mediaFetch);
    await expect(
      client.listProductMedia('0191310f-789a-7123-8123-000000000011', 'seller-1'),
    ).resolves.toHaveLength(1);

    const categoryFetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { categories: [{ categoryId: 'c1', name: 'Appliances', state: 'ACTIVE' }] },
        correlationId: 'c1',
      }),
    );
    const categoryClient = createClient(categoryFetch);
    await expect(categoryClient.listCategories()).resolves.toHaveLength(1);
  });

  it('lists and filters admin products by state', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { products: [] }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await client.adminListProducts('SUBMITTED');
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/products?state=SUBMITTED');
  });

  it('reads the admin product detail with transitions and audit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          product: {
            productId: '0191310f-789a-7123-8123-000000000011',
            sellerProfileId: '0191310f-789a-7123-8123-000000000003',
            categoryId: '0191310f-789a-7123-8123-000000000005',
            name: 'Espresso machine',
            state: 'SUBMITTED',
            sellingPrice: 499.99,
            version: 2,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
            variants: [],
            skus: [],
            media: [],
            transitions: [
              { toState: 'SUBMITTED', stateVersion: 2, actorKind: 'SELLER', transitionedAt: 't' },
            ],
            audit: [{ eventType: 'PRODUCT_SUBMITTED', actorIdentityId: 'u1', occurredAt: 't' }],
          },
        },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    const result = await client.adminGetProductDetail('0191310f-789a-7123-8123-000000000011');
    expect(result.transitions).toHaveLength(1);
    expect(result.audit).toHaveLength(1);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/products/0191310f-789a-7123-8123-000000000011');
  });

  it('records admin product review decisions (with reason for reject)', async () => {
    const approve = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { product: { productId: 'p1', state: 'APPROVED', version: 3 } },
        correlationId: 'c1',
      }),
    );
    const approveClient = createClient(approve);
    await expect(
      approveClient.adminReviewProduct({
        productId: '0191310f-789a-7123-8123-000000000011',
        action: 'APPROVE',
        expectedVersion: 2,
      }),
    ).resolves.toMatchObject({ state: 'APPROVED' });
    const [approveUrl] = approve.mock.calls[0] as [string, RequestInit];
    expect(approveUrl).toBe('/api/v1/admin/products/0191310f-789a-7123-8123-000000000011/review');

    const reject = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { product: { productId: 'p1', state: 'REJECTED', version: 3 } },
        correlationId: 'c1',
      }),
    );
    const rejectClient = createClient(reject);
    await rejectClient.adminReviewProduct({
      productId: '0191310f-789a-7123-8123-000000000011',
      action: 'REJECT',
      expectedVersion: 2,
      reasonReference: 'policy-002',
    });
    const [, rejectInit] = reject.mock.calls[0] as [string, RequestInit];
    expect(rejectInit.body).toContain('policy-002');
  });

  it('reads admin product media metadata', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { media: [] }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await expect(
      client.adminGetProductMedia('0191310f-789a-7123-8123-000000000011'),
    ).resolves.toEqual([]);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/products/0191310f-789a-7123-8123-000000000011/media');
  });

  // ----- Module 05 inventory (WEMP-M05-SPEC-001 §15) -----

  it('lists own inventory with the sellerProfileId query scope', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { inventory: [] }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await expect(client.listOwnInventory('seller-1')).resolves.toEqual([]);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/seller/inventory?sellerProfileId=seller-1');
  });

  it('reads own SKU detail and movement ledger', async () => {
    const detail = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          inventory: {
            skuId: 'sku-1',
            onHand: 12,
            reserved: 2,
            available: 10,
            version: 2,
            label: 'IN_STOCK',
          },
        },
        correlationId: 'c1',
      }),
    );
    const client = createClient(detail);
    await expect(client.getOwnSkuDetail('sku-1', 'seller-1')).resolves.toMatchObject({
      available: 10,
    });
    const [detailUrl] = detail.mock.calls[0] as [string, RequestInit];
    expect(detailUrl).toBe('/api/v1/seller/inventory/sku-1?sellerProfileId=seller-1');

    const ledger = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { movements: [] }, correlationId: 'c1' }));
    const ledgerClient = createClient(ledger);
    await expect(ledgerClient.getOwnMovementLedger('sku-1', 'seller-1')).resolves.toEqual([]);
    const [ledgerUrl] = ledger.mock.calls[0] as [string, RequestInit];
    expect(ledgerUrl).toBe('/api/v1/seller/inventory/sku-1/movements?sellerProfileId=seller-1');
  });

  it('performs a seller stock adjustment with the mandatory idempotency key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          inventory: {
            skuId: 'sku-1',
            onHand: 17,
            reserved: 2,
            available: 15,
            version: 3,
          },
        },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await expect(
      client.adjustStock({
        skuId: 'sku-1',
        sellerProfileId: 'seller-1',
        movementType: 'STOCK_IN',
        delta: 5,
        expectedVersion: 2,
      }),
    ).resolves.toMatchObject({ version: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/seller/inventory/sku-1/movements');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(init.body).toContain('STOCK_IN');
  });

  it('lists and reads admin inventory with audit records', async () => {
    const list = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { inventory: [] }, correlationId: 'c1' }));
    const listClient = createClient(list);
    await expect(listClient.adminListInventory()).resolves.toEqual([]);
    const [listUrl] = list.mock.calls[0] as [string, RequestInit];
    expect(listUrl).toBe('/api/v1/admin/inventory');

    const detail = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          inventory: {
            skuId: 'sku-1',
            sellerProfileId: 'seller-1',
            onHand: 30,
            reserved: 0,
            available: 30,
            version: 3,
            label: 'IN_STOCK',
            audit: [{ eventType: 'POOL_CORRECTED', actorIdentityId: 'u1', occurredAt: 't' }],
            movements: [],
          },
        },
        correlationId: 'c1',
      }),
    );
    const detailClient = createClient(detail);
    await expect(detailClient.adminGetSkuDetail('sku-1')).resolves.toMatchObject({
      sellerProfileId: 'seller-1',
    });
    const [detailUrl] = detail.mock.calls[0] as [string, RequestInit];
    expect(detailUrl).toBe('/api/v1/admin/inventory/sku-1');
  });

  it('performs an admin correction with the mandatory reason reference', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          inventory: {
            skuId: 'sku-1',
            onHand: 30,
            reserved: 0,
            available: 30,
            version: 4,
          },
        },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    await expect(
      client.adminCorrectStock({
        skuId: 'sku-1',
        targetOnHand: 30,
        expectedVersion: 3,
        reasonReference: 'count-2026-08-15',
      }),
    ).resolves.toMatchObject({ version: 4 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/inventory/sku-1/corrections');
    expect(init.body).toContain('count-2026-08-15');
  });

  it('reads and updates the D-14 threshold configuration (version-checked)', async () => {
    const read = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { config: { lowStockThreshold: 1, outOfStockThreshold: 0, version: 0 } },
        correlationId: 'c1',
      }),
    );
    const readClient = createClient(read);
    await expect(readClient.adminGetThresholdConfig()).resolves.toMatchObject({
      lowStockThreshold: 1,
    });
    const [readUrl] = read.mock.calls[0] as [string, RequestInit];
    expect(readUrl).toBe('/api/v1/admin/inventory-config');

    const write = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { config: { lowStockThreshold: 3, outOfStockThreshold: 2, version: 1 } },
        correlationId: 'c1',
      }),
    );
    const writeClient = createClient(write);
    await expect(
      writeClient.adminUpdateThresholdConfig({
        lowStockThreshold: 3,
        outOfStockThreshold: 2,
        expectedVersion: 0,
      }),
    ).resolves.toMatchObject({ version: 1 });
    const [writeUrl, writeInit] = write.mock.calls[0] as [string, RequestInit];
    expect(writeUrl).toBe('/api/v1/admin/inventory-config');
    expect(writeInit.method).toBe('PATCH');
    expect((writeInit.headers as Record<string, string>)['Idempotency-Key']).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});
