/**
 * M08-M5 — Typed client for the Module 08 Order APIs
 * (WEMP-M08-SPEC-001 §14).
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
 * details. D-10 rate limits (self reads 60/hr, self mutations 120/hr, admin
 * 50/hr) are enforced server-side; this client only renders the resulting
 * safe state.
 */

export type OrderState =
  'PENDING' | 'CONFIRMED' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'CLOSED';

export interface OrderLineResult {
  readonly orderLineId: string;
  readonly cartLineId: string;
  readonly skuId: string;
  readonly productId: string;
  readonly skuCode: string;
  readonly quantity: number;
  readonly unitPriceAmount: number;
  readonly unitPriceCurrency: string;
  readonly snapshotTaxIncluded: boolean;
  readonly revalidated: boolean;
}

export interface OrderResult {
  readonly orderId: string;
  readonly customerProfileId: string;
  readonly snapshotId: string;
  readonly cartId: string;
  readonly state: OrderState;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly subtotalAmountCents: number;
  readonly subtotalCurrency: string;
  readonly version: number;
  readonly lines: readonly OrderLineResult[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrderMutationResult {
  readonly orderId: string;
  readonly state: OrderState;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly version: number;
}

export interface CreateOrderInput {
  readonly snapshotId: string;
}

export interface CancelOrderInput {
  readonly expectedVersion: number;
  readonly reasonReference: string;
}

export interface AdminTransitionOrderInput {
  readonly toState: string;
  readonly reasonReference: string;
  readonly expectedVersion?: number;
}

/** Coarse, safe client error kinds — never server-internal codes. */
export type OrderApiErrorKind =
  | 'UNAUTHORIZED'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'NETWORK'
  | 'SERVER';

export class OrderApiError extends Error {
  public readonly kind: OrderApiErrorKind;

  public constructor(kind: OrderApiErrorKind, message: string) {
    super(message);
    this.name = 'OrderApiError';
    this.kind = kind;
  }
}

/** Safe, generic client messages (never server policy/internals). */
export function safeOrderMessage(kind: OrderApiErrorKind): string {
  switch (kind) {
    case 'UNAUTHORIZED':
      return 'Your session has expired. Sign in again to continue.';
    case 'ACCESS_DENIED':
      return 'You do not have permission to perform this action.';
    case 'NOT_FOUND':
      return 'The requested order could not be found.';
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
  readonly data?: Record<string, unknown>;
}

export interface OrderApiClientOptions {
  readonly baseUrl?: string;
  readonly getAccessToken?: () => string | null;
  readonly fetchImpl?: typeof fetch;
  readonly idempotencyKeyFactory?: () => string;
}

export class OrderApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly idempotencyKeyFactory: () => string;

  public constructor(options: OrderApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/api/v1').replace(/\/$/, '');
    this.getAccessToken = options.getAccessToken ?? (() => null);
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.idempotencyKeyFactory = options.idempotencyKeyFactory ?? defaultIdempotencyKey;
  }

  // ----- Order self-service -----

  /** Create a new order from a CartSnapshot (D-12). */
  public async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    const data = await this.request<{ order: OrderResult }>('POST', '/orders', { body: input });
    return data.order;
  }

  /** List own orders. */
  public async listOrders(): Promise<readonly OrderResult[]> {
    const data = await this.request<{ orders: readonly OrderResult[] }>('GET', '/orders');
    return data.orders;
  }

  /** Read own order with all lines (non-terminal states only; D-01). */
  public async readOrder(orderId: string): Promise<OrderResult> {
    const data = await this.request<{ order: OrderResult }>(
      'GET',
      `/orders/${encodeURIComponent(orderId)}`,
    );
    return data.order;
  }

  /** Cancel own pending order (idempotent; D-01/D-12). */
  public async cancelOrder(orderId: string, input: CancelOrderInput): Promise<OrderMutationResult> {
    const data = await this.request<{ mutation: OrderMutationResult }>(
      'DELETE',
      `/orders/${encodeURIComponent(orderId)}`,
      { body: input },
    );
    return data.mutation;
  }

  // ----- Admin order management -----

  /** Admin order detail (order.admin.read). */
  public async adminGetOrderDetail(orderId: string): Promise<OrderResult> {
    const data = await this.request<{ order: OrderResult }>(
      'GET',
      `/admin/orders/${encodeURIComponent(orderId)}`,
    );
    return data.order;
  }

  /** Admin state transition (order.admin.manage). */
  public async adminTransitionOrder(
    orderId: string,
    input: AdminTransitionOrderInput,
  ): Promise<OrderMutationResult> {
    const data = await this.request<{ mutation: OrderMutationResult }>(
      'POST',
      `/admin/orders/${encodeURIComponent(orderId)}/transition`,
      { body: input },
    );
    return data.mutation;
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
      throw new OrderApiError('NETWORK', safeOrderMessage('NETWORK'));
    }

    if (!response.ok) {
      throw mapOrderHttpError(response.status);
    }

    const payload = (await response.json()) as SuccessEnvelope;
    if (payload.data === undefined) {
      throw new OrderApiError('SERVER', safeOrderMessage('SERVER'));
    }
    return payload.data as T;
  }
}

function mapOrderHttpError(status: number): OrderApiError {
  switch (status) {
    case 401:
      return new OrderApiError('UNAUTHORIZED', safeOrderMessage('UNAUTHORIZED'));
    case 403:
      return new OrderApiError('ACCESS_DENIED', safeOrderMessage('ACCESS_DENIED'));
    case 404:
      return new OrderApiError('NOT_FOUND', safeOrderMessage('NOT_FOUND'));
    case 409:
      return new OrderApiError('CONFLICT', safeOrderMessage('CONFLICT'));
    case 429:
      return new OrderApiError('RATE_LIMITED', safeOrderMessage('RATE_LIMITED'));
    case 400:
      return new OrderApiError('VALIDATION', safeOrderMessage('VALIDATION'));
    default:
      return new OrderApiError('SERVER', safeOrderMessage('SERVER'));
  }
}

function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
