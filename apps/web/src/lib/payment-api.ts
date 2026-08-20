/**
 * M09-M5 — Typed client for the Module 09 Payment APIs.
 *
 * The server remains authoritative for authentication and authorization.
 * This client never decides access; it only consumes the approved envelope
 * and maps HTTP outcomes to safe, non-disclosing client states.
 *
 * Error handling is intentionally coarse: the UI shows generic, safe messages
 * and never surfaces server-internal error codes or provider details.
 */

export type PaymentState =
  | 'PENDING'
  | 'PROCESSING'
  | 'CAPTURED'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'EXPIRED';

export interface PaymentAttemptResult {
  readonly paymentAttemptId: string;
  readonly providerPaymentId: string | null;
  readonly outcome: string;
  readonly attemptedAt: string;
}

export interface PaymentRefundResult {
  readonly paymentRefundId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly state: string;
  readonly providerRefundId: string | null;
}

export interface PaymentResult {
  readonly paymentId: string;
  readonly orderId: string;
  readonly customerProfileId: string;
  readonly state: PaymentState;
  readonly amountCents: number;
  readonly currency: string;
  readonly provider: string;
  readonly providerOrderId: string | null;
  readonly providerPaymentId: string | null;
  readonly idempotencyKey: string;
  readonly version: number;
  readonly attempts: readonly PaymentAttemptResult[];
  readonly refunds: readonly PaymentRefundResult[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PaymentMutationResult {
  readonly paymentId: string;
  readonly orderId: string;
  readonly state: PaymentState;
  readonly providerOrderId: string | null;
  readonly version: number;
}

export interface InitiatePaymentInput {
  readonly orderId: string;
}

export interface AdminRefundInput {
  readonly amountCents: number;
  readonly reasonReference: string;
}

/** Coarse, safe client error kinds — never server-internal codes. */
export type PaymentApiErrorKind =
  | 'UNAUTHORIZED'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'NETWORK'
  | 'SERVER';

export class PaymentApiError extends Error {
  public readonly kind: PaymentApiErrorKind;

  public constructor(kind: PaymentApiErrorKind, message: string) {
    super(message);
    this.name = 'PaymentApiError';
    this.kind = kind;
  }
}

/** Safe, generic client messages (never server policy/internals). */
export function safePaymentMessage(kind: PaymentApiErrorKind): string {
  switch (kind) {
    case 'UNAUTHORIZED':
      return 'Your session has expired. Sign in again to continue.';
    case 'ACCESS_DENIED':
      return 'You do not have permission to perform this action.';
    case 'NOT_FOUND':
      return 'The requested payment could not be found.';
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

export interface PaymentApiClientOptions {
  readonly baseUrl?: string;
  readonly getAccessToken?: () => string | null;
  readonly fetchImpl?: typeof fetch;
  readonly idempotencyKeyFactory?: () => string;
}

export class PaymentApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly idempotencyKeyFactory: () => string;

  public constructor(options: PaymentApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/api/v1').replace(/\/$/, '');
    this.getAccessToken = options.getAccessToken ?? (() => null);
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.idempotencyKeyFactory = options.idempotencyKeyFactory ?? defaultIdempotencyKey;
  }

  // ----- Payment self-service -----

  /** Initiate a payment for an order (idempotent; D-05/D-12). */
  public async initiatePayment(input: InitiatePaymentInput): Promise<PaymentResult> {
    const data = await this.request<{ payment: PaymentResult }>('POST', '/payments', {
      body: input,
    });
    return data.payment;
  }

  /** Read own payment by ID. */
  public async readPayment(paymentId: string): Promise<PaymentResult> {
    const data = await this.request<{ payment: PaymentResult }>(
      'GET',
      `/payments/${encodeURIComponent(paymentId)}`,
    );
    return data.payment;
  }

  /** Read the payment for an order. */
  public async readPaymentByOrder(orderId: string): Promise<PaymentResult> {
    const data = await this.request<{ payment: PaymentResult }>(
      'GET',
      `/payments/order/${encodeURIComponent(orderId)}`,
    );
    return data.payment;
  }

  // ----- Admin payment management -----

  /** Admin payment detail (payment.admin.read). */
  public async adminGetPaymentDetail(paymentId: string): Promise<PaymentResult> {
    const data = await this.request<{ payment: PaymentResult }>(
      'GET',
      `/admin/payments/${encodeURIComponent(paymentId)}`,
    );
    return data.payment;
  }

  /** Admin initiate refund (payment.admin.manage). */
  public async adminInitiateRefund(
    paymentId: string,
    input: AdminRefundInput,
  ): Promise<PaymentMutationResult> {
    const data = await this.request<{ mutation: PaymentMutationResult }>(
      'POST',
      `/admin/payments/${encodeURIComponent(paymentId)}/refund`,
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
      throw new PaymentApiError('NETWORK', safePaymentMessage('NETWORK'));
    }

    if (!response.ok) {
      throw mapPaymentHttpError(response.status);
    }

    const payload = (await response.json()) as SuccessEnvelope;
    if (payload.data === undefined) {
      throw new PaymentApiError('SERVER', safePaymentMessage('SERVER'));
    }
    return payload.data as T;
  }
}

function mapPaymentHttpError(status: number): PaymentApiError {
  switch (status) {
    case 401:
      return new PaymentApiError('UNAUTHORIZED', safePaymentMessage('UNAUTHORIZED'));
    case 403:
      return new PaymentApiError('ACCESS_DENIED', safePaymentMessage('ACCESS_DENIED'));
    case 404:
      return new PaymentApiError('NOT_FOUND', safePaymentMessage('NOT_FOUND'));
    case 409:
      return new PaymentApiError('CONFLICT', safePaymentMessage('CONFLICT'));
    case 429:
      return new PaymentApiError('RATE_LIMITED', safePaymentMessage('RATE_LIMITED'));
    case 400:
      return new PaymentApiError('VALIDATION', safePaymentMessage('VALIDATION'));
    default:
      return new PaymentApiError('SERVER', safePaymentMessage('SERVER'));
  }
}

function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
