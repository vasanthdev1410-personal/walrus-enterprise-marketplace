import { describe, expect, it, vi } from 'vitest';
import { CustomerApiClient } from './customer-api';
import type { CustomerApiClientOptions } from './customer-api';

function createClient(
  fetchImpl: typeof fetch,
  options: Omit<CustomerApiClientOptions, 'fetchImpl'> = {},
): CustomerApiClient {
  return new CustomerApiClient({ fetchImpl, ...options });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PROFILE = {
  customerProfileId: '0191310f-789a-7123-8123-000000000003',
  state: 'ACTIVE',
  version: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('CustomerApiClient', () => {
  it('reads the own profile from the success envelope', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { profile: PROFILE }, correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    const result = await client.getProfile();
    expect(result.customerProfileId).toBe(PROFILE.customerProfileId);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/customer/profile');
    expect(init.method).toBe('GET');
  });

  it('sends the bearer token when a session exists', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { profile: PROFILE }, correlationId: 'c1' }));
    const client = createClient(fetchImpl, { getAccessToken: () => 'token-abc' });
    await client.getProfile();
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
  });

  it('omits the bearer header when no session exists (server decides access)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { profile: PROFILE }, correlationId: 'c1' }));
    const client = createClient(fetchImpl, { getAccessToken: () => null });
    await client.getProfile();
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('carries an Idempotency-Key on mutations', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { data: { profile: { ...PROFILE, version: 3 } }, correlationId: 'c1' }),
      );
    const client = createClient(fetchImpl);
    await client.updateProfile({ expectedVersion: 2 });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
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
    await expect(client.getProfile()).rejects.toMatchObject({
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
    await expect(client.getProfile()).rejects.toMatchObject({ kind: 'ACCESS_DENIED' });
  });

  it('maps 404 to NOT_FOUND (non-enumerating)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(404, {
        success: false,
        message: 'CUSTOMER_NOT_FOUND',
        errorCode: 'RESOURCE_NOT_FOUND',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.getBusinessProfile()).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it('maps 409 to CONFLICT (state conflict)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        success: false,
        message: 'CUSTOMER_STATE_CONFLICT',
        errorCode: 'UNEXPECTED_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(client.updateProfile({ expectedVersion: 1 })).rejects.toMatchObject({
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
    await expect(client.getProfile()).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
  });

  it('maps 400 to VALIDATION (DTO allow-listing)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        success: false,
        message: 'CUSTOMER_PRECONDITION_FAILED',
        errorCode: 'VALIDATION_ERROR',
        errors: [],
      }),
    );
    const client = createClient(fetchImpl);
    await expect(
      client.createAddress({
        recipientName: 'Ada',
        line1: '1 Way',
        city: 'London',
        postalCode: 'SW1A',
        countryCode: 'GB',
        roles: ['SHIPPING'],
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ kind: 'VALIDATION' });
  });

  it('fails closed on a malformed success envelope', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: 'unexpected', correlationId: 'c1' }));
    const client = createClient(fetchImpl);
    await expect(client.getProfile()).rejects.toMatchObject({ kind: 'SERVER' });
  });

  it('maps network failures to NETWORK', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createClient(fetchImpl);
    await expect(client.getProfile()).rejects.toMatchObject({ kind: 'NETWORK' });
  });

  it('routes admin lifecycle actions to the admin endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { customer: { customerProfileId: 'x', state: 'SUSPENDED', version: 3 } },
        correlationId: 'c1',
      }),
    );
    const client = createClient(fetchImpl);
    const result = await client.adminApplyLifecycleAction({
      customerProfileId: '0191310f-789a-7123-8123-000000000003',
      action: 'SUSPEND',
      reasonReference: 'AZR-REF-001',
      expectedVersion: 2,
    });
    expect(result.state).toBe('SUSPENDED');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/admin\/customers\/[^/]+\/lifecycle$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { action: string };
    expect(body.action).toBe('SUSPEND');
  });
});
