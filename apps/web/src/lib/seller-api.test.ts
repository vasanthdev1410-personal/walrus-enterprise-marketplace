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
});
