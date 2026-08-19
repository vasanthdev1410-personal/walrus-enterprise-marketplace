/**
 * M07-M5 — Typed client for the Module 07 Shopping Cart APIs
 * (WEMP-M07-SPEC-001 §14).
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

export type CartState = 'ACTIVE' | 'CHECKED_OUT' | 'ARCHIVED' | 'AUTO_EXPIRED';

export interface CartLineResult {
  readonly cartLineId: string;
  readonly skuId: string;
  readonly productId: string;
  readonly skuCode: string;
  readonly quantity: number;
  readonly unitPriceAmount: number;
  readonly unitPriceCurrency: string;
  readonly snapshotTaxIncluded: boolean;
  readonly productUnavailable: boolean;
}

export interface CartResult {
  readonly cartId: string;
  readonly customerProfileId: string;
  readonly state: CartState;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly version: number;
  readonly lines: readonly CartLineResult[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
}

export interface CartMutationResult {
  readonly cartId: string;
  readonly state: CartState;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly version: number;
}

export interface CheckoutHandoffResult {
  readonly cartId: string;
  readonly snapshotId: string;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly subtotalAmountCents: number;
  readonly subtotalCurrency: string;
  readonly version: number;
}

export interface AddCartItemInput {
  readonly skuId: string;
  readonly productId: string;
  readonly skuCode: string;
  readonly quantity: number;
  readonly expectedVersion: number;
}

export interface UpdateCartItemQuantityInput {
  readonly quantity: number;
  readonly expectedVersion: number;
}

export interface RemoveCartItemInput {
  readonly expectedVersion: number;
}

export interface ClearCartInput {
  readonly expectedVersion: number;
}

export interface CheckoutHandoffInput {
  readonly expectedVersion: number;
}

export interface AdminCartExpireInput {
  readonly reasonReference: string;
}

/** Coarse, safe client error kinds — never server-internal codes. */
export type CartApiErrorKind =
  | 'UNAUTHORIZED'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'NETWORK'
  | 'SERVER';

export class CartApiError extends Error {
  public readonly kind: CartApiErrorKind;

  public constructor(kind: CartApiErrorKind, message: string) {
    super(message);
    this.name = 'CartApiError';
    this.kind = kind;
  }
}

/** Safe, generic client messages (never server policy/internals). */
export function safeCartMessage(kind: CartApiErrorKind): string {
  switch (kind) {
    case 'UNAUTHORIZED':
      return 'Your session has expired. Sign in again to continue.';
    case 'ACCESS_DENIED':
      return 'You do not have permission to perform this action.';
    case 'NOT_FOUND':
      return 'The requested cart could not be found.';
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

export interface CartApiClientOptions {
  /** Base URL including the `/api/v1` prefix. Defaults to the same-origin proxy. */
  readonly baseUrl?: string;
  /** Supplies the bearer access token; returns null when the session is absent. */
  readonly getAccessToken?: () => string | null;
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
  /** Idempotency-key factory for mutations (defaults to a fresh UUIDv4). */
  readonly idempotencyKeyFactory?: () => string;
}

export class CartApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly idempotencyKeyFactory: () => string;

  public constructor(options: CartApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/api/v1').replace(/\/$/, '');
    this.getAccessToken = options.getAccessToken ?? (() => null);
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.idempotencyKeyFactory = options.idempotencyKeyFactory ?? defaultIdempotencyKey;
  }

  // ----- Cart self-service -----

  /** Read own active cart with all lines (D-07). */
  public async getCart(): Promise<CartResult> {
    const data = await this.request<{ cart: CartResult }>('GET', '/cart');
    return data.cart;
  }

  /** Add a SKU to own cart (auto-creates if needed; D-02/D-03/D-06/D-17). */
  public async addItem(input: AddCartItemInput): Promise<CartResult> {
    const data = await this.request<{ cart: CartResult }>('POST', '/cart/items', { body: input });
    return data.cart;
  }

  /** Update line quantity in own cart (naturally idempotent; D-04/D-06/D-16). */
  public async updateItemQuantity(
    cartLineId: string,
    input: UpdateCartItemQuantityInput,
  ): Promise<CartMutationResult> {
    const data = await this.request<{ mutation: CartMutationResult }>(
      'PATCH',
      `/cart/items/${encodeURIComponent(cartLineId)}`,
      { body: input },
    );
    return data.mutation;
  }

  /** Remove a line from own cart (naturally idempotent; D-06/D-16). */
  public async removeItem(
    cartLineId: string,
    input: RemoveCartItemInput,
  ): Promise<CartMutationResult> {
    const data = await this.request<{ mutation: CartMutationResult }>(
      'DELETE',
      `/cart/items/${encodeURIComponent(cartLineId)}`,
      { body: input },
    );
    return data.mutation;
  }

  /** Clear all lines from own cart (idempotent; D-06/D-17). */
  public async clearCart(input: ClearCartInput): Promise<CartMutationResult> {
    const data = await this.request<{ mutation: CartMutationResult }>('POST', '/cart/clear', {
      body: input,
    });
    return data.mutation;
  }

  /** Hand off own cart to Module 08 Orders as immutable snapshot (D-08/D-17). */
  public async checkoutHandoff(input: CheckoutHandoffInput): Promise<CheckoutHandoffResult> {
    const data = await this.request<{ checkout: CheckoutHandoffResult }>('POST', '/cart/checkout', {
      body: input,
    });
    return data.checkout;
  }

  // ----- Admin cart management -----

  /** Admin cart detail (cart.admin.read). */
  public async adminGetCartDetail(cartId: string): Promise<{ cartId: string }> {
    const data = await this.request<{ cartId: string }>(
      'GET',
      `/admin/carts/${encodeURIComponent(cartId)}`,
    );
    return data;
  }

  /** Admin expire a cart (cart.admin.manage; mandatory reason). */
  public async adminExpireCart(
    cartId: string,
    input: AdminCartExpireInput,
  ): Promise<CartMutationResult> {
    const data = await this.request<{ mutation: CartMutationResult }>(
      'POST',
      `/admin/carts/${encodeURIComponent(cartId)}/expire`,
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
      throw new CartApiError('NETWORK', safeCartMessage('NETWORK'));
    }

    if (!response.ok) {
      throw mapCartHttpError(response.status);
    }

    const payload = (await response.json()) as SuccessEnvelope;
    if (payload.data === undefined) {
      throw new CartApiError('SERVER', safeCartMessage('SERVER'));
    }
    return payload.data as T;
  }
}

function mapCartHttpError(status: number): CartApiError {
  switch (status) {
    case 401:
      return new CartApiError('UNAUTHORIZED', safeCartMessage('UNAUTHORIZED'));
    case 403:
      return new CartApiError('ACCESS_DENIED', safeCartMessage('ACCESS_DENIED'));
    case 404:
      return new CartApiError('NOT_FOUND', safeCartMessage('NOT_FOUND'));
    case 409:
      return new CartApiError('CONFLICT', safeCartMessage('CONFLICT'));
    case 429:
      return new CartApiError('RATE_LIMITED', safeCartMessage('RATE_LIMITED'));
    case 400:
      return new CartApiError('VALIDATION', safeCartMessage('VALIDATION'));
    default:
      return new CartApiError('SERVER', safeCartMessage('SERVER'));
  }
}

function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
