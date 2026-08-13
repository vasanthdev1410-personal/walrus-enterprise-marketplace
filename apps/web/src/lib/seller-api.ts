/**
 * M03-M6 — Typed client for the M03-M5 Seller & Admin APIs
 * (WEMP-M03-SPEC-001 §13 / WEMP-M03-CONTRACT-001).
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
 * details. No evidence content is ever fetched by this client — the admin
 * evidence endpoint returns metadata only.
 */

export type SellerState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CORRECTIONS_REQUESTED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'CLOSED';

export type ComplianceState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'VERIFICATION_REQUIRED'
  | 'COMPLIANT'
  | 'NON_COMPLIANT';

export type VerificationType = 'GST' | 'PAN' | 'BANK' | 'ADDRESS';

export interface OrganizationSummary {
  readonly legalName: string;
  readonly tradeName: string;
  readonly businessAddress: string;
}

export interface VerificationSummary {
  readonly verificationType: VerificationType;
  readonly state: string;
  readonly generation: number;
}

export interface OnboardingStatus {
  readonly sellerProfileId: string;
  readonly state: SellerState;
  readonly complianceState: ComplianceState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string;
  readonly approvedAt?: string;
  readonly suspendedAt?: string;
  readonly organization: OrganizationSummary;
  readonly verifications: readonly VerificationSummary[];
}

export interface MemberSummary {
  readonly identityId: string;
  readonly associationRole: 'OWNER' | 'MEMBER';
  readonly isPrimary: boolean;
  readonly state: 'ACTIVE' | 'REMOVED';
  readonly addedAt: string;
}

export interface OwnProfile extends OnboardingStatus {
  readonly members: readonly MemberSummary[];
}

export interface WarehouseSummary {
  readonly warehouseId: string;
  readonly name: string;
  readonly state: 'ACTIVE' | 'CLOSED';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgreementSummary {
  readonly agreementId: string;
  readonly agreementType: string;
  readonly reference: string;
  readonly state: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly signedAt?: string;
}

export interface VerificationStatus {
  readonly sellerProfileId: string;
  readonly complianceState: ComplianceState;
  readonly verifications: readonly VerificationSummary[];
}

export interface BusinessInfo {
  readonly version: number;
  readonly legalName: string;
  readonly tradeName: string;
  readonly businessAddress: string;
}

export interface AdminSellerListEntry {
  readonly sellerProfileId: string;
  readonly state: SellerState;
  readonly complianceState: ComplianceState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EvidenceMetadataEntry {
  readonly verificationId: string;
  readonly verificationType: VerificationType;
  readonly verificationState: string;
  readonly generation: number;
  readonly evidenceId: string;
  readonly evidenceType: string;
  readonly evidenceReference: string;
  readonly evidenceDigest: string;
  readonly uploadedByIdentityId: string;
  readonly uploadedAt: string;
}

export interface CreateOnboardingInput {
  readonly legalName: string;
  readonly tradeName: string;
  readonly registrationNumber: string;
  readonly businessAddress: string;
}

export interface SubmitOnboardingInput {
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
}

export interface UpdateProfileInput {
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
  readonly legalName?: string;
  readonly tradeName?: string;
  readonly businessAddress?: string;
}

export interface EvidenceDescriptor {
  readonly evidenceType: string;
  readonly evidenceReference: string;
  readonly evidenceDigest: string;
}

export interface SubmitVerificationInput {
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
  readonly verificationType: VerificationType;
  readonly evidence: readonly EvidenceDescriptor[];
}

export interface CreateWarehouseInput {
  readonly expectedVersion: number;
  readonly name: string;
  readonly address: string;
}

export interface CloseWarehouseInput {
  readonly warehouseId: string;
  readonly expectedVersion: number;
}

export interface AddMemberInput {
  readonly expectedVersion: number;
  readonly memberIdentityId: string;
}

export interface RemoveMemberInput {
  readonly identityId: string;
  readonly expectedVersion: number;
}

export type AdminReviewAction =
  | 'CLAIM_REVIEW'
  | 'REQUEST_CORRECTIONS'
  | 'APPROVE'
  | 'REJECT';

export interface AdminReviewInput {
  readonly sellerProfileId: string;
  readonly action: AdminReviewAction;
  readonly expectedVersion: number;
  readonly reasonReference?: string;
}

export interface AdminSuspendInput {
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
  readonly reasonReference: string;
}

export interface AdminReactivateInput {
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
}

/** Coarse, safe client error kinds — never server-internal codes. */
export type SellerApiErrorKind =
  | 'UNAUTHORIZED'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'NETWORK'
  | 'SERVER';

export class SellerApiError extends Error {
  public readonly kind: SellerApiErrorKind;

  public constructor(kind: SellerApiErrorKind, message: string) {
    super(message);
    this.name = 'SellerApiError';
    this.kind = kind;
  }
}

/** Safe, generic client messages (never server policy/evidence internals). */
export function safeMessage(kind: SellerApiErrorKind): string {
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

export interface SellerApiClientOptions {
  /** Base URL including the `/api/v1` prefix. Defaults to the same-origin proxy. */
  readonly baseUrl?: string;
  /** Supplies the bearer access token; returns null when the session is absent. */
  readonly getAccessToken?: () => string | null;
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
  /** Idempotency-key factory for mutations (defaults to a fresh UUIDv4). */
  readonly idempotencyKeyFactory?: () => string;
}

export class SellerApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly idempotencyKeyFactory: () => string;

  public constructor(options: SellerApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/api/v1').replace(/\/$/, '');
    this.getAccessToken = options.getAccessToken ?? (() => null);
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.idempotencyKeyFactory = options.idempotencyKeyFactory ?? defaultIdempotencyKey;
  }

  // ----- Seller self-service (pre-approval surface) -----

  public async createOnboarding(input: CreateOnboardingInput): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>('POST', '/seller/onboarding', { body: input });
    return data.seller;
  }

  public async submitOnboarding(input: SubmitOnboardingInput): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>('POST', '/seller/onboarding/submit', { body: input });
    return data.seller;
  }

  public async getOnboardingStatus(): Promise<OnboardingStatus> {
    const data = await this.request<{ seller: OnboardingStatus }>('GET', '/seller/onboarding');
    return data.seller;
  }

  public async getProfile(): Promise<OwnProfile> {
    const data = await this.request<{ profile: OwnProfile }>('GET', '/seller/profile');
    return data.profile;
  }

  public async updateProfile(input: UpdateProfileInput): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>('PATCH', '/seller/profile', { body: input });
    return data.seller;
  }

  public async getBusiness(): Promise<BusinessInfo> {
    const data = await this.request<{ business: BusinessInfo }>('GET', '/seller/business');
    return data.business;
  }

  public async updateBusiness(input: UpdateProfileInput): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>('PATCH', '/seller/business', { body: input });
    return data.seller;
  }

  public async submitVerification(input: SubmitVerificationInput): Promise<{ state: string; generation: number }> {
    const data = await this.request<{ verification: { state: string; generation: number } }>('POST', '/seller/verification', { body: input });
    return data.verification;
  }

  public async getVerificationStatus(): Promise<VerificationStatus> {
    const data = await this.request<{ verification: VerificationStatus }>('GET', '/seller/verification');
    return data.verification;
  }

  public async listWarehouses(): Promise<readonly WarehouseSummary[]> {
    const data = await this.request<{ warehouses: readonly WarehouseSummary[] }>('GET', '/seller/warehouses');
    return data.warehouses;
  }

  public async createWarehouse(input: CreateWarehouseInput): Promise<{ state: 'ACTIVE' | 'CLOSED' }> {
    const data = await this.request<{ warehouse: { state: 'ACTIVE' | 'CLOSED' } }>('POST', '/seller/warehouses', { body: input });
    return data.warehouse;
  }

  public async closeWarehouse(input: CloseWarehouseInput): Promise<{ state: 'ACTIVE' | 'CLOSED' }> {
    const data = await this.request<{ warehouse: { state: 'ACTIVE' | 'CLOSED' } }>('POST', `/seller/warehouses/${input.warehouseId}/close`, {
      body: { expectedVersion: input.expectedVersion, warehouseId: input.warehouseId },
    });
    return data.warehouse;
  }

  public async listAgreements(): Promise<readonly AgreementSummary[]> {
    const data = await this.request<{ agreements: readonly AgreementSummary[] }>('GET', '/seller/agreements');
    return data.agreements;
  }

  public async listMembers(): Promise<readonly MemberSummary[]> {
    const data = await this.request<{ members: readonly MemberSummary[] }>('GET', '/seller/members');
    return data.members;
  }

  public async addMember(input: AddMemberInput): Promise<{ associationState: 'ACTIVE' | 'REMOVED' }> {
    const data = await this.request<{ member: { associationState: 'ACTIVE' | 'REMOVED' } }>('POST', '/seller/members', { body: input });
    return data.member;
  }

  public async removeMember(input: RemoveMemberInput): Promise<{ associationState: 'ACTIVE' | 'REMOVED' }> {
    const data = await this.request<{ member: { associationState: 'ACTIVE' | 'REMOVED' } }>('DELETE', `/seller/members/${input.identityId}`, {
      body: { expectedVersion: input.expectedVersion },
    });
    return data.member;
  }

  // ----- Admin seller management -----

  public async listSellers(state?: SellerState): Promise<readonly AdminSellerListEntry[]> {
    const query = state === undefined ? '' : `?state=${encodeURIComponent(state)}`;
    const data = await this.request<{ sellers: readonly AdminSellerListEntry[] }>('GET', `/admin/sellers${query}`);
    return data.sellers;
  }

  public async getSellerDetail(sellerProfileId: string): Promise<OwnProfile> {
    const data = await this.request<{ seller: OwnProfile }>('GET', `/admin/sellers/${sellerProfileId}`);
    return data.seller;
  }

  public async reviewSeller(input: AdminReviewInput): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>('POST', `/admin/sellers/${input.sellerProfileId}/review`, {
      body: {
        action: input.action,
        expectedVersion: input.expectedVersion,
        ...(input.reasonReference === undefined ? {} : { reasonReference: input.reasonReference }),
      },
    });
    return data.seller;
  }

  public async suspendSeller(input: AdminSuspendInput): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>('POST', `/admin/sellers/${input.sellerProfileId}/suspend`, {
      body: { expectedVersion: input.expectedVersion, reasonReference: input.reasonReference },
    });
    return data.seller;
  }

  public async reactivateSeller(input: AdminReactivateInput): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>('POST', `/admin/sellers/${input.sellerProfileId}/reactivate`, {
      body: { expectedVersion: input.expectedVersion },
    });
    return data.seller;
  }

  public async getEvidenceMetadata(sellerProfileId: string): Promise<readonly EvidenceMetadataEntry[]> {
    const data = await this.request<{ evidence: readonly EvidenceMetadataEntry[] }>('GET', `/admin/sellers/${sellerProfileId}/evidence`);
    return data.evidence;
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
      throw new SellerApiError('NETWORK', safeMessage('NETWORK'));
    }

    if (!response.ok) {
      throw mapHttpError(response.status);
    }

    const payload = (await response.json()) as SuccessEnvelope;
    if (payload.data === undefined) {
      throw new SellerApiError('SERVER', safeMessage('SERVER'));
    }
    return payload.data as T;
  }
}

function mapHttpError(status: number): SellerApiError {
  switch (status) {
    case 401:
      return new SellerApiError('UNAUTHORIZED', safeMessage('UNAUTHORIZED'));
    case 403:
      return new SellerApiError('ACCESS_DENIED', safeMessage('ACCESS_DENIED'));
    case 404:
      return new SellerApiError('NOT_FOUND', safeMessage('NOT_FOUND'));
    case 409:
      return new SellerApiError('CONFLICT', safeMessage('CONFLICT'));
    case 429:
      return new SellerApiError('RATE_LIMITED', safeMessage('RATE_LIMITED'));
    case 400:
      return new SellerApiError('VALIDATION', safeMessage('VALIDATION'));
    default:
      return new SellerApiError('SERVER', safeMessage('SERVER'));
  }
}

function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
