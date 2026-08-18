/**
 * M06-M5 — Typed client for the Module 06 Customer Management APIs
 * (WEMP-M06-SPEC-001 §14).
 *
 * The server remains authoritative for authentication and authorization.
 * This client never decides access; it only consumes the approved envelope
 * and maps HTTP outcomes to safe, non-disclosing client states. Mutation
 * requests carry an `Idempotency-Key` (reusing the Module 01 pattern); reads
 * are never cached (`no-store` is the API's own response policy).
 *
 * Error handling is intentionally coarse: the UI shows generic, safe messages
 * (session expired / access denied / not found / conflict / rate limited /
 * network / server) and never surfaces server-internal error codes or policy
 * details. D-10 rate limits (self reads 60/hr, self mutations 30/hr, admin
 * 50/hr) are enforced server-side; this client only renders the resulting
 * safe state.
 */

export type CustomerState = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export interface CustomerProfileResult {
  readonly customerProfileId: string;
  readonly state: CustomerState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly suspendedAt?: string;
  readonly closedAt?: string;
}

export type CustomerAddressRole = 'SHIPPING' | 'BILLING';

export interface CustomerAddressResult {
  readonly addressId: string;
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly region?: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly phone?: string;
  readonly roles: readonly CustomerAddressRole[];
  readonly isDefaultShipping: boolean;
  readonly isDefaultBilling: boolean;
  readonly state: 'ACTIVE' | 'REMOVED';
}

export interface CustomerBusinessProfileResult {
  readonly customerBusinessProfileId: string;
  readonly companyName: string;
  readonly registrationLookupDigest?: string;
  readonly businessType?: string;
}

export type CustomerPreferenceKey = 'language' | 'currency' | 'locale';

export interface CustomerPreferenceResult {
  readonly preferenceId: string;
  readonly preferenceKey: CustomerPreferenceKey;
  readonly preferenceValue: string;
}

export interface AdminCustomerListEntry {
  readonly customerProfileId: string;
  readonly state: CustomerState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerAuditEntry {
  readonly auditEventId: string;
  readonly eventType: string;
  readonly actorIdentityId: string;
  readonly occurredAt: string;
}

export interface CustomerTransitionEntry {
  readonly transitionId: string;
  readonly fromState: string;
  readonly toState: string;
  readonly stateVersion: number;
  readonly actorIdentityId: string;
  readonly actorKind: string;
  readonly reasonReference: string;
  readonly transitionedAt: string;
}

export interface AdminCustomerDetailResult extends AdminCustomerListEntry {
  readonly identityId: string;
  readonly suspendedAt?: string;
  readonly closedAt?: string;
  readonly audit: readonly CustomerAuditEntry[];
  readonly transitions: readonly CustomerTransitionEntry[];
}

export type CustomerLifecycleAction = 'SUSPEND' | 'REACTIVATE' | 'CLOSE';

export interface CustomerProfileUpdateInput {
  readonly expectedVersion: number;
}

export interface CreateCustomerAddressInput {
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly region?: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly phone?: string;
  readonly roles: readonly CustomerAddressRole[];
  readonly expectedVersion: number;
}

export interface UpdateCustomerAddressInput {
  readonly addressId: string;
  readonly recipientName?: string;
  readonly line1?: string;
  readonly line2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly phone?: string;
  readonly setDefaultRole?: CustomerAddressRole;
  readonly expectedVersion: number;
}

export interface RemoveCustomerAddressInput {
  readonly addressId: string;
  readonly expectedVersion: number;
}

export interface CustomerBusinessProfilePatchInput {
  /** Registration reference is hashed server-side; never persisted raw (D-05). */
  readonly registrationReference?: string;
  readonly companyName: string;
  readonly businessType?: string;
  readonly expectedVersion: number;
}

export interface CustomerPreferencePatchInput {
  readonly preferenceKey: CustomerPreferenceKey;
  readonly preferenceValue: string;
  readonly expectedVersion: number;
}

export interface CustomerLifecycleActionInput {
  readonly customerProfileId: string;
  readonly action: CustomerLifecycleAction;
  readonly reasonReference: string;
  readonly expectedVersion: number;
}

/** Coarse, safe client error kinds — never server-internal codes. */
export type CustomerApiErrorKind =
  | 'UNAUTHORIZED'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'NETWORK'
  | 'SERVER';

export class CustomerApiError extends Error {
  public readonly kind: CustomerApiErrorKind;

  public constructor(kind: CustomerApiErrorKind, message: string) {
    super(message);
    this.name = 'CustomerApiError';
    this.kind = kind;
  }
}

/** Safe, generic client messages (never server policy/internals). */
export function safeCustomerMessage(kind: CustomerApiErrorKind): string {
  switch (kind) {
    case 'UNAUTHORIZED':
      return 'Your session has expired. Sign in again to continue.';
    case 'ACCESS_DENIED':
      return 'You do not have permission to perform this action.';
    case 'NOT_FOUND':
      return 'The requested record could not be found.';
    case 'CONFLICT':
      return 'This action conflicts with the current state. Refresh and try again.';
    case 'RATE_LIMITED':
      return 'Too many requests. Please try again shortly.';
    case 'VALIDATION':
      return 'The request could not be completed. Check the entered details and try again.';
    case 'NETWORK':
      return 'The service is temporarily unreachable. Please try again shortly.';
    case 'SERVER':
      return 'An unexpected error occurred. Please try again shortly.';
  }
}

interface SuccessEnvelope {
  /** Absent in malformed/unexpected success bodies — the client fails closed. */
  readonly data?: Record<string, unknown>;
}

export interface CustomerApiClientOptions {
  /** Base URL including the `/api/v1` prefix. Defaults to the same-origin proxy. */
  readonly baseUrl?: string;
  /** Supplies the bearer access token; returns null when the session is absent. */
  readonly getAccessToken?: () => string | null;
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
  /** Idempotency-key factory for mutations (defaults to a fresh UUIDv4). */
  readonly idempotencyKeyFactory?: () => string;
}

export class CustomerApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly idempotencyKeyFactory: () => string;

  public constructor(options: CustomerApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/api/v1').replace(/\/$/, '');
    this.getAccessToken = options.getAccessToken ?? (() => null);
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.idempotencyKeyFactory = options.idempotencyKeyFactory ?? defaultIdempotencyKey;
  }

  // ----- Customer self-service -----

  public async getProfile(): Promise<CustomerProfileResult> {
    const data = await this.request<{ profile: CustomerProfileResult }>('GET', '/customer/profile');
    return data.profile;
  }

  public async updateProfile(input: CustomerProfileUpdateInput): Promise<CustomerProfileResult> {
    const data = await this.request<{ profile: CustomerProfileResult }>(
      'PATCH',
      '/customer/profile',
      { body: input },
    );
    return data.profile;
  }

  public async listAddresses(): Promise<readonly CustomerAddressResult[]> {
    const data = await this.request<{ addresses: readonly CustomerAddressResult[] }>(
      'GET',
      '/customer/addresses',
    );
    return data.addresses;
  }

  public async createAddress(input: CreateCustomerAddressInput): Promise<CustomerAddressResult> {
    const data = await this.request<{ address: CustomerAddressResult }>(
      'POST',
      '/customer/addresses',
      { body: input },
    );
    return data.address;
  }

  public async updateAddress(input: UpdateCustomerAddressInput): Promise<CustomerAddressResult> {
    const { addressId, ...body } = input;
    const data = await this.request<{ address: CustomerAddressResult }>(
      'PATCH',
      `/customer/addresses/${encodeURIComponent(addressId)}`,
      { body },
    );
    return data.address;
  }

  public async removeAddress(input: RemoveCustomerAddressInput): Promise<{ removed: boolean }> {
    const { addressId, ...body } = input;
    const data = await this.request<{ removed: boolean }>(
      'DELETE',
      `/customer/addresses/${encodeURIComponent(addressId)}`,
      { body },
    );
    return data;
  }

  public async getBusinessProfile(): Promise<CustomerBusinessProfileResult> {
    const data = await this.request<{ business: CustomerBusinessProfileResult }>(
      'GET',
      '/customer/business',
    );
    return data.business;
  }

  public async upsertBusinessProfile(
    input: CustomerBusinessProfilePatchInput,
  ): Promise<CustomerBusinessProfileResult> {
    const data = await this.request<{ business: CustomerBusinessProfileResult }>(
      'PATCH',
      '/customer/business',
      { body: input },
    );
    return data.business;
  }

  public async listPreferences(): Promise<readonly CustomerPreferenceResult[]> {
    const data = await this.request<{ preferences: readonly CustomerPreferenceResult[] }>(
      'GET',
      '/customer/preferences',
    );
    return data.preferences;
  }

  public async updatePreference(
    input: CustomerPreferencePatchInput,
  ): Promise<CustomerPreferenceResult> {
    const data = await this.request<{ preference: CustomerPreferenceResult }>(
      'PATCH',
      '/customer/preferences',
      { body: input },
    );
    return data.preference;
  }

  // ----- Admin customer management -----

  public async adminListCustomers(): Promise<readonly AdminCustomerListEntry[]> {
    const data = await this.request<{ customers: readonly AdminCustomerListEntry[] }>(
      'GET',
      '/admin/customers',
    );
    return data.customers;
  }

  public async adminGetCustomerDetail(
    customerProfileId: string,
  ): Promise<AdminCustomerDetailResult> {
    const data = await this.request<{ customer: AdminCustomerDetailResult }>(
      'GET',
      `/admin/customers/${encodeURIComponent(customerProfileId)}`,
    );
    return data.customer;
  }

  public async adminGetCustomerAudit(
    customerProfileId: string,
  ): Promise<readonly CustomerAuditEntry[]> {
    const data = await this.request<{ audit: readonly CustomerAuditEntry[] }>(
      'GET',
      `/admin/customers/${encodeURIComponent(customerProfileId)}/audit`,
    );
    return data.audit;
  }

  public async adminApplyLifecycleAction(
    input: CustomerLifecycleActionInput,
  ): Promise<{ customerProfileId: string; state: CustomerState; version: number }> {
    const { customerProfileId, ...body } = input;
    const data = await this.request<{
      customer: { customerProfileId: string; state: CustomerState; version: number };
    }>('POST', `/admin/customers/${encodeURIComponent(customerProfileId)}/lifecycle`, {
      body,
    });
    return data.customer;
  }

  // ----- transport -----

  private async request<T extends Record<string, unknown>>(
    method: string,
    path: string,
    options: { body?: object } = {},
  ): Promise<T> {
    const token = this.getAccessToken();
    const isMutation = method !== 'GET';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (isMutation) headers['Idempotency-Key'] = this.idempotencyKeyFactory();
    if (token !== null && token.length > 0) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        cache: 'no-store',
      });
    } catch {
      throw new CustomerApiError('NETWORK', safeCustomerMessage('NETWORK'));
    }

    if (!response.ok) {
      throw mapCustomerHttpError(response.status);
    }

    const payload = (await response.json()) as SuccessEnvelope;
    if (payload.data === undefined) {
      throw new CustomerApiError('SERVER', safeCustomerMessage('SERVER'));
    }
    return payload.data as T;
  }
}

function mapCustomerHttpError(status: number): CustomerApiError {
  switch (status) {
    case 401:
      return new CustomerApiError('UNAUTHORIZED', safeCustomerMessage('UNAUTHORIZED'));
    case 403:
      return new CustomerApiError('ACCESS_DENIED', safeCustomerMessage('ACCESS_DENIED'));
    case 404:
      return new CustomerApiError('NOT_FOUND', safeCustomerMessage('NOT_FOUND'));
    case 409:
      return new CustomerApiError('CONFLICT', safeCustomerMessage('CONFLICT'));
    case 429:
      return new CustomerApiError('RATE_LIMITED', safeCustomerMessage('RATE_LIMITED'));
    case 400:
      return new CustomerApiError('VALIDATION', safeCustomerMessage('VALIDATION'));
    default:
      return new CustomerApiError('SERVER', safeCustomerMessage('SERVER'));
  }
}

function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
