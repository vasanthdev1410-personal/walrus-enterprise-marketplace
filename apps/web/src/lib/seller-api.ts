/**
 * M03-M6 + M04-M6 — Typed client for the M03-M5 Seller & Admin APIs
 * (WEMP-M03-SPEC-001 §13 / WEMP-M03-CONTRACT-001) and the M04-M5 Product
 * Catalog APIs (WEMP-M04-SPEC-001 §18 / WEMP-M04-CONTRACT-001).
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
  'NOT_STARTED' | 'IN_PROGRESS' | 'VERIFICATION_REQUIRED' | 'COMPLIANT' | 'NON_COMPLIANT';

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

// ---------------------------------------------------------------------------
// Module 04 — Product Catalog (WEMP-M04-SPEC-001 §18, M04-M5/M04-M6)
// ---------------------------------------------------------------------------

export type ProductState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'CORRECTIONS_REQUESTED'
  | 'UNPUBLISHED'
  | 'REJECTED'
  | 'CLOSED';

export interface ProductListEntry {
  readonly productId: string;
  readonly sellerProfileId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly state: ProductState;
  readonly sellingPrice: number;
  readonly compareAtPrice?: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VariantSummary {
  readonly variantId: string;
  readonly name: string;
  readonly state: ProductState;
  readonly sellingPrice: number;
  readonly compareAtPrice?: number;
}

export interface SkuSummary {
  readonly skuId: string;
  readonly variantId?: string;
  readonly skuCode: string;
  readonly state: 'ACTIVE' | 'CLOSED';
}

export interface MediaMetadataEntry {
  readonly mediaId: string;
  readonly productId: string;
  readonly mediaType: string;
  readonly mediaReference: string;
  readonly mediaDigest: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedByIdentityId: string;
  readonly state: 'ACTIVE' | 'REMOVED';
  readonly uploadedAt: string;
}

export interface ProductDetailResult extends ProductListEntry {
  readonly variants: readonly VariantSummary[];
  readonly skus: readonly SkuSummary[];
  readonly media: readonly MediaMetadataEntry[];
}

export interface ProductTransitionEntry {
  readonly fromState?: ProductState;
  readonly toState: ProductState;
  readonly stateVersion: number;
  readonly actorKind: string;
  readonly transitionedAt: string;
  readonly reasonReference?: string;
}

export interface ProductAuditRecord {
  readonly eventType: string;
  readonly actorIdentityId: string;
  readonly occurredAt: string;
}

export interface AdminProductDetailResult extends ProductDetailResult {
  readonly transitions: readonly ProductTransitionEntry[];
  readonly audit: readonly ProductAuditRecord[];
}

export interface CategorySummary {
  readonly categoryId: string;
  readonly name: string;
  readonly parentCategoryId?: string;
  readonly state: 'ACTIVE' | 'RETIRED';
}

export interface CreateProductInput {
  readonly sellerProfileId: string;
  readonly name: string;
  readonly categoryId: string;
  readonly sellingPrice: number;
  readonly compareAtPrice?: number;
  readonly skus: readonly { readonly skuCode: string; readonly variantId?: string }[];
}

export interface UpdateProductInput {
  readonly productId: string;
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly categoryId?: string;
  readonly sellingPrice?: number;
  readonly compareAtPrice?: number;
  readonly skusToUpsert?: readonly { readonly skuCode: string; readonly variantId?: string }[];
}

export interface SubmitProductInput {
  readonly productId: string;
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
}

export interface CloseProductInput {
  readonly productId: string;
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
  readonly reasonReference: string;
}

export interface AddVariantInput {
  readonly productId: string;
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
  readonly name: string;
  readonly sellingPrice: number;
  readonly compareAtPrice?: number;
  readonly skuCode: string;
}

export interface AddSkuInput {
  readonly productId: string;
  /** Variant the SKU attaches to (the M04-M5 API exposes SKU add via a variant). */
  readonly variantId: string;
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
  readonly skuCode: string;
}

export interface CloseSkuInput {
  readonly productId: string;
  readonly skuId: string;
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
}

export interface RecordMediaInput {
  readonly productId: string;
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
  readonly mediaReference: string;
  readonly mediaDigest: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly sizeBytes: number;
}

export type ProductReviewAction =
  'CLAIM_REVIEW' | 'REQUEST_CORRECTIONS' | 'APPROVE' | 'REJECT' | 'PUBLISH';

export interface AdminProductReviewInput {
  readonly productId: string;
  readonly action: ProductReviewAction;
  readonly expectedVersion: number;
  readonly reasonReference?: string;
}

// ---------------------------------------------------------------------------
// Module 05 — Inventory (WEMP-M05-SPEC-001 §15, M05-M5)
// ---------------------------------------------------------------------------

export type InventoryStockLabel = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface InventoryListEntry {
  readonly skuId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly version: number;
  readonly label?: InventoryStockLabel;
}

export interface InventoryMovementEntry {
  readonly movementId: string;
  readonly movementType: string;
  readonly delta: number;
  readonly resultingOnHand: number;
  readonly resultingReserved: number;
  readonly actorIdentityId: string;
  readonly reasonReference?: string;
  readonly occurredAt: string;
}

export interface AdminInventoryDetailResult extends InventoryListEntry {
  readonly sellerProfileId: string;
  readonly audit: readonly {
    readonly eventType: string;
    readonly actorIdentityId: string;
    readonly occurredAt: string;
  }[];
  readonly movements: readonly InventoryMovementEntry[];
}

export interface InventoryAdjustResult {
  readonly skuId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly version: number;
}

export type InventoryMovementType = 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';

export interface SellerAdjustStockInput {
  readonly skuId: string;
  readonly sellerProfileId: string;
  readonly movementType: InventoryMovementType;
  /** Positive magnitude (D-08): 1..1,000,000. */
  readonly delta: number;
  readonly direction?: 'INCREASE' | 'DECREASE';
  /** Optimistic concurrency guard. */
  readonly expectedVersion: number;
  /** Mandatory on STOCK_OUT/ADJUSTMENT (D-08). */
  readonly reasonReference?: string;
}

export interface AdminCorrectStockInput {
  readonly skuId: string;
  readonly targetOnHand: number;
  readonly expectedVersion: number;
  readonly reasonReference: string;
}

export interface ThresholdConfigResult {
  readonly lowStockThreshold: number;
  readonly outOfStockThreshold: number;
  readonly version: number;
}

export interface ThresholdConfigPatchInput {
  readonly lowStockThreshold: number;
  readonly outOfStockThreshold: number;
  readonly expectedVersion: number;
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

export type AdminReviewAction = 'CLAIM_REVIEW' | 'REQUEST_CORRECTIONS' | 'APPROVE' | 'REJECT';

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

  public async createOnboarding(
    input: CreateOnboardingInput,
  ): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>(
      'POST',
      '/seller/onboarding',
      { body: input },
    );
    return data.seller;
  }

  public async submitOnboarding(
    input: SubmitOnboardingInput,
  ): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>(
      'POST',
      '/seller/onboarding/submit',
      { body: input },
    );
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

  public async updateProfile(
    input: UpdateProfileInput,
  ): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>(
      'PATCH',
      '/seller/profile',
      { body: input },
    );
    return data.seller;
  }

  public async getBusiness(): Promise<BusinessInfo> {
    const data = await this.request<{ business: BusinessInfo }>('GET', '/seller/business');
    return data.business;
  }

  public async updateBusiness(
    input: UpdateProfileInput,
  ): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>(
      'PATCH',
      '/seller/business',
      { body: input },
    );
    return data.seller;
  }

  public async submitVerification(
    input: SubmitVerificationInput,
  ): Promise<{ state: string; generation: number }> {
    const data = await this.request<{ verification: { state: string; generation: number } }>(
      'POST',
      '/seller/verification',
      { body: input },
    );
    return data.verification;
  }

  public async getVerificationStatus(): Promise<VerificationStatus> {
    const data = await this.request<{ verification: VerificationStatus }>(
      'GET',
      '/seller/verification',
    );
    return data.verification;
  }

  public async listWarehouses(): Promise<readonly WarehouseSummary[]> {
    const data = await this.request<{ warehouses: readonly WarehouseSummary[] }>(
      'GET',
      '/seller/warehouses',
    );
    return data.warehouses;
  }

  public async createWarehouse(
    input: CreateWarehouseInput,
  ): Promise<{ state: 'ACTIVE' | 'CLOSED' }> {
    const data = await this.request<{ warehouse: { state: 'ACTIVE' | 'CLOSED' } }>(
      'POST',
      '/seller/warehouses',
      { body: input },
    );
    return data.warehouse;
  }

  public async closeWarehouse(input: CloseWarehouseInput): Promise<{ state: 'ACTIVE' | 'CLOSED' }> {
    const data = await this.request<{ warehouse: { state: 'ACTIVE' | 'CLOSED' } }>(
      'POST',
      `/seller/warehouses/${input.warehouseId}/close`,
      {
        body: { expectedVersion: input.expectedVersion, warehouseId: input.warehouseId },
      },
    );
    return data.warehouse;
  }

  public async listAgreements(): Promise<readonly AgreementSummary[]> {
    const data = await this.request<{ agreements: readonly AgreementSummary[] }>(
      'GET',
      '/seller/agreements',
    );
    return data.agreements;
  }

  public async listMembers(): Promise<readonly MemberSummary[]> {
    const data = await this.request<{ members: readonly MemberSummary[] }>(
      'GET',
      '/seller/members',
    );
    return data.members;
  }

  public async addMember(
    input: AddMemberInput,
  ): Promise<{ associationState: 'ACTIVE' | 'REMOVED' }> {
    const data = await this.request<{ member: { associationState: 'ACTIVE' | 'REMOVED' } }>(
      'POST',
      '/seller/members',
      { body: input },
    );
    return data.member;
  }

  public async removeMember(
    input: RemoveMemberInput,
  ): Promise<{ associationState: 'ACTIVE' | 'REMOVED' }> {
    const data = await this.request<{ member: { associationState: 'ACTIVE' | 'REMOVED' } }>(
      'DELETE',
      `/seller/members/${input.identityId}`,
      {
        body: { expectedVersion: input.expectedVersion },
      },
    );
    return data.member;
  }

  // ----- Admin seller management -----

  public async listSellers(state?: SellerState): Promise<readonly AdminSellerListEntry[]> {
    const query = state === undefined ? '' : `?state=${encodeURIComponent(state)}`;
    const data = await this.request<{ sellers: readonly AdminSellerListEntry[] }>(
      'GET',
      `/admin/sellers${query}`,
    );
    return data.sellers;
  }

  public async getSellerDetail(sellerProfileId: string): Promise<OwnProfile> {
    const data = await this.request<{ seller: OwnProfile }>(
      'GET',
      `/admin/sellers/${sellerProfileId}`,
    );
    return data.seller;
  }

  public async reviewSeller(
    input: AdminReviewInput,
  ): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>(
      'POST',
      `/admin/sellers/${input.sellerProfileId}/review`,
      {
        body: {
          action: input.action,
          expectedVersion: input.expectedVersion,
          ...(input.reasonReference === undefined
            ? {}
            : { reasonReference: input.reasonReference }),
        },
      },
    );
    return data.seller;
  }

  public async suspendSeller(
    input: AdminSuspendInput,
  ): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>(
      'POST',
      `/admin/sellers/${input.sellerProfileId}/suspend`,
      {
        body: { expectedVersion: input.expectedVersion, reasonReference: input.reasonReference },
      },
    );
    return data.seller;
  }

  public async reactivateSeller(
    input: AdminReactivateInput,
  ): Promise<{ state: SellerState; version: number }> {
    const data = await this.request<{ seller: { state: SellerState; version: number } }>(
      'POST',
      `/admin/sellers/${input.sellerProfileId}/reactivate`,
      {
        body: { expectedVersion: input.expectedVersion },
      },
    );
    return data.seller;
  }

  public async getEvidenceMetadata(
    sellerProfileId: string,
  ): Promise<readonly EvidenceMetadataEntry[]> {
    const data = await this.request<{ evidence: readonly EvidenceMetadataEntry[] }>(
      'GET',
      `/admin/sellers/${sellerProfileId}/evidence`,
    );
    return data.evidence;
  }

  // ----- Seller product catalog (Module 04, WEMP-M04-SPEC-001 §18) -----

  public async listProducts(sellerProfileId: string): Promise<readonly ProductListEntry[]> {
    const query = `?sellerProfileId=${encodeURIComponent(sellerProfileId)}`;
    const data = await this.request<{ products: readonly ProductListEntry[] }>(
      'GET',
      `/seller/products${query}`,
    );
    return data.products;
  }

  public async getProductDetail(
    productId: string,
    sellerProfileId: string,
  ): Promise<ProductDetailResult> {
    const query = `?sellerProfileId=${encodeURIComponent(sellerProfileId)}`;
    const data = await this.request<{ product: ProductDetailResult }>(
      'GET',
      `/seller/products/${encodeURIComponent(productId)}${query}`,
    );
    return data.product;
  }

  public async createProduct(
    input: CreateProductInput,
  ): Promise<{ productId: string; state: ProductState; version: number }> {
    const data = await this.request<{
      product: { productId: string; state: ProductState; version: number };
    }>('POST', '/seller/products', { body: input });
    return data.product;
  }

  public async updateProduct(
    input: UpdateProductInput,
  ): Promise<{ productId: string; state: ProductState; version: number }> {
    const { productId, ...body } = input;
    const data = await this.request<{
      product: { productId: string; state: ProductState; version: number };
    }>('PATCH', `/seller/products/${encodeURIComponent(productId)}`, { body });
    return data.product;
  }

  public async submitProduct(
    input: SubmitProductInput,
  ): Promise<{ productId: string; state: ProductState; version: number }> {
    const { productId, ...body } = input;
    const data = await this.request<{
      product: { productId: string; state: ProductState; version: number };
    }>('POST', `/seller/products/${encodeURIComponent(productId)}/submit`, { body });
    return data.product;
  }

  public async closeProduct(
    input: CloseProductInput,
  ): Promise<{ productId: string; state: ProductState; version: number }> {
    const { productId, ...body } = input;
    const data = await this.request<{
      product: { productId: string; state: ProductState; version: number };
    }>('POST', `/seller/products/${encodeURIComponent(productId)}/close`, { body });
    return data.product;
  }

  public async listVariants(
    productId: string,
    sellerProfileId: string,
  ): Promise<{ variants: readonly VariantSummary[]; skus: readonly SkuSummary[] }> {
    const query = `?sellerProfileId=${encodeURIComponent(sellerProfileId)}`;
    return this.request<{ variants: readonly VariantSummary[]; skus: readonly SkuSummary[] }>(
      'GET',
      `/seller/products/${encodeURIComponent(productId)}/variants${query}`,
    );
  }

  public async addVariant(
    input: AddVariantInput,
  ): Promise<{ variantId: string; skuCode: string; version: number }> {
    const { productId, ...body } = input;
    const data = await this.request<{
      variant: { variantId: string; skuCode: string; version: number };
    }>('POST', `/seller/products/${encodeURIComponent(productId)}/variants`, { body });
    return data.variant;
  }

  public async addSku(
    input: AddSkuInput,
  ): Promise<{ skuId: string; skuCode: string; version: number }> {
    const { productId, variantId, ...body } = input;
    const data = await this.request<{ sku: { skuId: string; skuCode: string; version: number } }>(
      'POST',
      `/seller/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/skus`,
      { body },
    );
    return data.sku;
  }

  public async closeSku(
    input: CloseSkuInput,
  ): Promise<{ skuId: string; skuCode: string; version: number }> {
    const { productId, skuId, ...body } = input;
    const data = await this.request<{ sku: { skuId: string; skuCode: string; version: number } }>(
      'POST',
      `/seller/products/${encodeURIComponent(productId)}/skus/${encodeURIComponent(skuId)}/close`,
      { body },
    );
    return data.sku;
  }

  public async listProductMedia(
    productId: string,
    sellerProfileId: string,
  ): Promise<readonly MediaMetadataEntry[]> {
    const query = `?sellerProfileId=${encodeURIComponent(sellerProfileId)}`;
    const data = await this.request<{ media: readonly MediaMetadataEntry[] }>(
      'GET',
      `/seller/products/${encodeURIComponent(productId)}/media${query}`,
    );
    return data.media;
  }

  public async recordMedia(
    input: RecordMediaInput,
  ): Promise<{ mediaId: string; productId: string; version: number }> {
    const { productId, ...body } = input;
    const data = await this.request<{
      media: { mediaId: string; productId: string; version: number };
    }>('POST', `/seller/products/${encodeURIComponent(productId)}/media`, { body });
    return data.media;
  }

  public async listCategories(): Promise<readonly CategorySummary[]> {
    const data = await this.request<{ categories: readonly CategorySummary[] }>(
      'GET',
      '/seller/categories',
    );
    return data.categories;
  }

  // ----- Admin product moderation (Module 04, WEMP-M04-SPEC-001 §18) -----

  public async adminListProducts(state?: ProductState): Promise<readonly ProductListEntry[]> {
    const query = state === undefined ? '' : `?state=${encodeURIComponent(state)}`;
    const data = await this.request<{ products: readonly ProductListEntry[] }>(
      'GET',
      `/admin/products${query}`,
    );
    return data.products;
  }

  public async adminGetProductDetail(productId: string): Promise<AdminProductDetailResult> {
    const data = await this.request<{ product: AdminProductDetailResult }>(
      'GET',
      `/admin/products/${encodeURIComponent(productId)}`,
    );
    return data.product;
  }

  public async adminReviewProduct(
    input: AdminProductReviewInput,
  ): Promise<{ productId: string; state: ProductState; version: number }> {
    const { productId, ...body } = input;
    const data = await this.request<{
      product: { productId: string; state: ProductState; version: number };
    }>('POST', `/admin/products/${encodeURIComponent(productId)}/review`, { body });
    return data.product;
  }

  public async adminGetProductMedia(productId: string): Promise<readonly MediaMetadataEntry[]> {
    const data = await this.request<{ media: readonly MediaMetadataEntry[] }>(
      'GET',
      `/admin/products/${encodeURIComponent(productId)}/media`,
    );
    return data.media;
  }

  // ----- Module 05 — Inventory (WEMP-M05-SPEC-001 §15, M05-M5) -----

  public async listOwnInventory(sellerProfileId: string): Promise<readonly InventoryListEntry[]> {
    const query = `?sellerProfileId=${encodeURIComponent(sellerProfileId)}`;
    const data = await this.request<{ inventory: readonly InventoryListEntry[] }>(
      'GET',
      `/seller/inventory${query}`,
    );
    return data.inventory;
  }

  public async getOwnSkuDetail(
    skuId: string,
    sellerProfileId: string,
  ): Promise<InventoryListEntry> {
    const query = `?sellerProfileId=${encodeURIComponent(sellerProfileId)}`;
    const data = await this.request<{ inventory: InventoryListEntry }>(
      'GET',
      `/seller/inventory/${encodeURIComponent(skuId)}${query}`,
    );
    return data.inventory;
  }

  public async getOwnMovementLedger(
    skuId: string,
    sellerProfileId: string,
  ): Promise<readonly InventoryMovementEntry[]> {
    const query = `?sellerProfileId=${encodeURIComponent(sellerProfileId)}`;
    const data = await this.request<{ movements: readonly InventoryMovementEntry[] }>(
      'GET',
      `/seller/inventory/${encodeURIComponent(skuId)}/movements${query}`,
    );
    return data.movements;
  }

  public async adjustStock(input: SellerAdjustStockInput): Promise<InventoryAdjustResult> {
    const data = await this.request<{ inventory: InventoryAdjustResult }>(
      'POST',
      `/seller/inventory/${encodeURIComponent(input.skuId)}/movements`,
      { body: input },
    );
    return data.inventory;
  }

  public async adminListInventory(): Promise<readonly InventoryListEntry[]> {
    const data = await this.request<{ inventory: readonly InventoryListEntry[] }>(
      'GET',
      '/admin/inventory',
    );
    return data.inventory;
  }

  public async adminGetSkuDetail(skuId: string): Promise<AdminInventoryDetailResult> {
    const data = await this.request<{ inventory: AdminInventoryDetailResult }>(
      'GET',
      `/admin/inventory/${encodeURIComponent(skuId)}`,
    );
    return data.inventory;
  }

  public async adminGetMovementLedger(skuId: string): Promise<readonly InventoryMovementEntry[]> {
    const data = await this.request<{ movements: readonly InventoryMovementEntry[] }>(
      'GET',
      `/admin/inventory/${encodeURIComponent(skuId)}/movements`,
    );
    return data.movements;
  }

  public async adminCorrectStock(input: AdminCorrectStockInput): Promise<InventoryAdjustResult> {
    const data = await this.request<{ inventory: InventoryAdjustResult }>(
      'POST',
      `/admin/inventory/${encodeURIComponent(input.skuId)}/corrections`,
      { body: input },
    );
    return data.inventory;
  }

  public async adminGetThresholdConfig(): Promise<ThresholdConfigResult> {
    const data = await this.request<{ config: ThresholdConfigResult }>(
      'GET',
      '/admin/inventory-config',
    );
    return data.config;
  }

  public async adminUpdateThresholdConfig(
    input: ThresholdConfigPatchInput,
  ): Promise<ThresholdConfigResult> {
    const data = await this.request<{ config: ThresholdConfigResult }>(
      'PATCH',
      '/admin/inventory-config',
      { body: input },
    );
    return data.config;
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
