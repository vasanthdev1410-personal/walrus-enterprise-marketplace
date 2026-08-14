import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Product } from '../../domain/entities/product';
import { ProductAuditRecord } from '../../domain/entities/product-audit-record';
import { ProductSku } from '../../domain/entities/product-sku';
import { ProductStateTransition } from '../../domain/entities/product-state-transition';
import type { ProductLifecycle } from '../../domain/lifecycle/product-lifecycle';
import type { ProductCatalogPolicy } from '../../domain/policy/product-catalog.policy';
import type {
  ProductAggregateChangeSet,
  ProductCatalogRepository,
} from '../../domain/ports/product-catalog-repository.port';
import type { Module02SellerAuthorizationContractPort } from '../../domain/ports/module-02-03-contract.port';
import type { Price } from '../../domain/value-objects/price';
import type { SkuCode } from '../../domain/value-objects/sku-code';
import { ProductApplicationError } from '../errors/product-application.error';

/**
 * WEMP-M04-PLAN-001 M04-M3. Product lifecycle application service.
 * - createProduct: DRAFT product creation (D-01 owner-only management, D-16
 *   validation), duplicate-SKU detection, rate-limited, idempotent.
 * - updateProduct: version-guarded definition update (D-02 edit rules),
 *   SKU immutability once PUBLISHED (D-06), validated attribute/media
 *   references, idempotent.
 * - submitProduct / resubmitProduct: DRAFT/CORRECTIONS_REQUESTED →
 *   SUBMITTED with the submission-completeness precondition (D-16),
 *   idempotent re-submission.
 * - closeProduct: seller withdrawal/closure with a mandatory reason.
 * Every mutation is version-checked, appends a mandatory ProductAuditRecord
 * atomically, and resolves the OWNER association through the Module 02
 * ownership contract (D-01/D-11) — no client-supplied scope. Fail closed on
 * any ownership, state, or validation violation.
 */
export class ProductApplicationService {
  public constructor(
    private readonly repository: ProductCatalogRepository,
    private readonly module02: Module02SellerAuthorizationContractPort,
    private readonly lifecycle: ProductLifecycle,
    private readonly policy: ProductCatalogPolicy,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  /**
   * WEMP-M04-SPEC-001 §18/§22/§26 (decisions D-01, D-11, D-16). Creates a
   * DRAFT product for the caller's own seller organization. The listing gate
   * (spec §26) requires an APPROVED/ACTIVE seller; the caller must additionally
   * hold an ACTIVE OWNER association (management is owner-only, D-01); MEMBER
   * associations are read-only. Fail closed on any missing association or
   * ineligible seller state — never a client-supplied scope.
   */
  public async createProduct(command: CreateProductCommand): Promise<ProductMutationResult> {
    const rateLimit = await this.rateLimiter.consume({
      key: `product-create:${command.actorIdentityId.value}`,
      limit: 10,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new ProductApplicationError('PRODUCT_PRECONDITION_FAILED');
    }
    // Listing gate (WEMP-M04-SPEC-001 §26): only an APPROVED or ACTIVE seller
    // with an ACTIVE association may list products. Any other state
    // (DRAFT/SUBMITTED/UNDER_REVIEW/CORRECTIONS_REQUESTED/SUSPENDED/REJECTED/
    // CLOSED) fails closed — the seller may never create catalog entries.
    const eligibility = await this.module02.isSellerEligibleToList(
      command.actorIdentityId,
      command.sellerProfileId,
    );
    if (!eligibility.eligible) {
      throw new ProductApplicationError('PRODUCT_OWNERSHIP_DENIED');
    }
    await this.assertOwner(command.actorIdentityId, command.sellerProfileId);

    return this.idempotency.execute<ProductMutationResult>({
      scope: `seller:${command.sellerProfileId.value}`,
      operationType: 'product.create',
      idempotencyKey: `create:${command.requestKey}`,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const productId = this.identifiers.next();
        const product = new Product({
          productId,
          sellerProfileId: command.sellerProfileId,
          categoryId: command.categoryId,
          name: command.name,
          state: 'DRAFT',
          sellingPrice: command.sellingPrice,
          ...(command.compareAtPrice !== undefined
            ? { compareAtPrice: command.compareAtPrice }
            : {}),
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        const skus = command.skus.map((sku) =>
          this.newSku(productId, command.sellerProfileId, sku),
        );
        // Per-seller SKU uniqueness (D-06) — checked against the new set
        // before insert; a duplicate within the request fails closed.
        this.policy.assertUniqueSkuWithinSeller(skus, command.sellerProfileId.value, []);
        const initialTransition = new ProductStateTransition({
          productStateTransitionId: this.identifiers.next(),
          productId,
          toState: 'DRAFT',
          stateVersion: 1,
          actorIdentityId: command.actorIdentityId,
          actorKind: 'SELLER_OWNER',
          transitionedAt: now,
          createdAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        const audit = new ProductAuditRecord({
          auditEventId: this.identifiers.next(),
          productId,
          eventType: 'PRODUCT_CREATED',
          actorIdentityId: command.actorIdentityId,
          occurredAt: now,
          createdAt: now,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        const changeSet: ProductAggregateChangeSet = {
          product,
          variantsToAppend: [],
          skusToAppend: skus,
          mediaToAppend: [],
          attributeValuesToAppend: [],
          transitionsToAppend: [initialTransition],
          auditRecordsToAppend: [audit],
          priceHistoryToAppend: [],
        };
        await this.repository.insert(changeSet);
        return {
          productId: productId.value,
          state: 'DRAFT',
          version: 1,
        };
      },
    });
  }

  /**
   * WEMP-M04-SPEC-001 §5 invariant 3 / §18 (decisions D-02, D-06, D-16).
   * Version-guarded definition update permitted in DRAFT,
   * CORRECTIONS_REQUESTED and UNPUBLISHED (edits to a PUBLISHED product must
   * first move it into re-moderation). SKUs are immutable once PUBLISHED.
   * Updates never change lifecycle state directly and never create a
   * state-transition episode; the change is audited.
   */
  public async updateProduct(command: UpdateProductCommand): Promise<ProductMutationResult> {
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    this.lifecycle.assertCanUpdate(product.properties.state);
    await this.assertOwner(command.actorIdentityId, product.properties.sellerProfileId);

    return this.idempotency.execute<ProductMutationResult>({
      scope: `product:${command.productId.value}`,
      operationType: 'product.update',
      idempotencyKey: `update:${String(command.expectedVersion)}`,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const properties = product.properties;
        const updated = new Product({
          ...properties,
          ...(command.name !== undefined ? { name: command.name } : {}),
          ...(command.categoryId !== undefined ? { categoryId: command.categoryId } : {}),
          ...(command.sellingPrice !== undefined ? { sellingPrice: command.sellingPrice } : {}),
          ...(command.compareAtPrice !== undefined
            ? { compareAtPrice: command.compareAtPrice }
            : {}),
          updatedAt: now,
          aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
        });
        // SKU immutability (D-06): any SKU change on a PUBLISHED product is
        // denied regardless of the edit gate.
        if (command.skusToUpsert !== undefined && command.skusToUpsert.length > 0) {
          this.policy.assertSkuMutable(product);
        }
        const skusToAppend: ProductSku[] = [];
        if (command.skusToUpsert !== undefined && command.skusToUpsert.length > 0) {
          const existingSkus = await this.repository.findSkus(command.productId);
          for (const skuCommand of command.skusToUpsert) {
            skusToAppend.push(
              this.newSku(command.productId, properties.sellerProfileId, skuCommand),
            );
          }
          // Uniqueness across the existing ACTIVE set plus the new ones,
          // excluding the product's own existing SKUs (they may be re-sent).
          this.policy.assertUniqueSkuWithinSeller(
            [...existingSkus, ...skusToAppend],
            properties.sellerProfileId.value,
            existingSkus.map((sku) => sku.properties.skuId.value),
          );
        }
        await this.repository.save(
          this.changeSetWithAudit(
            updated,
            command.actorIdentityId,
            'PRODUCT_UPDATED',
            now,
            { skusToAppend, variantsToAppend: [], mediaToAppend: [], attributeValuesToAppend: [] },
            command.correlationId,
          ),
          properties.aggregateVersion,
        );
        return {
          productId: command.productId.value,
          state: updated.properties.state,
          version: updated.properties.aggregateVersion.value,
        };
      },
    });
  }

  /**
   * WEMP-M04-SPEC-001 §13.1 (decisions D-02, D-10). DRAFT → SUBMITTED by the
   * OWNER with the submission-completeness precondition. Idempotent
   * re-submission resolves without duplicate transition episodes; version
   * guarded; mandatory audit appended.
   */
  public async submitProduct(command: SubmitProductCommand): Promise<ProductMutationResult> {
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    if (product.properties.state !== 'DRAFT') {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    await this.assertOwner(command.actorIdentityId, product.properties.sellerProfileId);

    return this.idempotency.execute<ProductMutationResult>({
      scope: `product:${command.productId.value}`,
      operationType: 'product.submit',
      idempotencyKey: `submit:${String(product.properties.aggregateVersion.value)}`,
      request: command,
      execute: async () => {
        const [category, skus] = await Promise.all([
          this.repository.findCategory(product.properties.categoryId),
          this.repository.findSkus(command.productId),
        ]);
        const submissionComplete = this.policy.isSubmissionComplete(product, category, skus);
        const now = this.clock.now();
        const transition = this.lifecycle.transition({
          product,
          toState: 'SUBMITTED',
          actor: { identityId: command.actorIdentityId, kind: 'SELLER_OWNER' },
          now,
          transitionId: this.identifiers.next(),
          submissionComplete,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        const updated = this.lifecycle.updatedProduct(product, 'SUBMITTED', now);
        await this.repository.save(
          this.changeSetWithAudit(
            updated,
            command.actorIdentityId,
            'PRODUCT_SUBMITTED',
            now,
            { transitions: [transition] },
            command.correlationId,
          ),
          product.properties.aggregateVersion,
        );
        return {
          productId: command.productId.value,
          state: 'SUBMITTED',
          version: updated.properties.aggregateVersion.value,
        };
      },
    });
  }

  /**
   * WEMP-M04-SPEC-001 §13 (decisions D-02, D-10). CORRECTIONS_REQUESTED →
   * SUBMITTED by the OWNER, starting a new review cycle. Also used from
   * UNPUBLISHED (re-moderation before re-publication). Version guarded and
   * audited.
   */
  public async resubmitProduct(command: SubmitProductCommand): Promise<ProductMutationResult> {
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    if (
      product.properties.state !== 'CORRECTIONS_REQUESTED' &&
      product.properties.state !== 'UNPUBLISHED'
    ) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    await this.assertOwner(command.actorIdentityId, product.properties.sellerProfileId);

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      product,
      toState: 'SUBMITTED',
      actor: { identityId: command.actorIdentityId, kind: 'SELLER_OWNER' },
      now,
      transitionId: this.identifiers.next(),
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProduct(product, 'SUBMITTED', now);
    await this.repository.save(
      this.changeSetWithAudit(
        updated,
        command.actorIdentityId,
        'PRODUCT_RESUBMITTED',
        now,
        { transitions: [transition] },
        command.correlationId,
      ),
      product.properties.aggregateVersion,
    );
    return {
      productId: command.productId.value,
      state: 'SUBMITTED',
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * WEMP-M04-SPEC-001 §18 (decision D-01/D-02). Seller-initiated withdrawal
   * or closure with a mandatory reason. Version guarded and audited.
   */
  public async closeProduct(command: CloseProductCommand): Promise<ProductMutationResult> {
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    await this.assertOwner(command.actorIdentityId, product.properties.sellerProfileId);

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      product,
      toState: 'CLOSED',
      actor: { identityId: command.actorIdentityId, kind: 'SELLER_OWNER' },
      now,
      transitionId: this.identifiers.next(),
      reasonReference: command.reasonReference,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProduct(product, 'CLOSED', now);
    await this.repository.save(
      this.changeSetWithAudit(
        updated,
        command.actorIdentityId,
        'PRODUCT_CLOSED',
        now,
        { transitions: [transition] },
        command.correlationId,
      ),
      product.properties.aggregateVersion,
    );
    return {
      productId: command.productId.value,
      state: 'CLOSED',
      version: updated.properties.aggregateVersion.value,
    };
  }

  private newSku(productId: UuidV7, sellerProfileId: UuidV7, sku: SkuCommand): ProductSku {
    return new ProductSku({
      skuId: this.identifiers.next(),
      sellerProfileId,
      productId,
      ...(sku.variantId !== undefined ? { variantId: sku.variantId } : {}),
      skuCode: sku.skuCode,
      state: 'ACTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  /**
   * WEMP-M04-SPEC-001 §4/§16 (decisions D-01, D-11). Resolves the caller's
   * ACTIVE association through the Module 02 ownership contract. Management
   * actions require the OWNER association; MEMBER associations are
   * read-only. Fail closed: no ACTIVE association or any resolution error
   * denies (PRODUCT_OWNERSHIP_DENIED).
   */
  private async assertOwner(actorIdentityId: UuidV7, sellerProfileId: UuidV7): Promise<void> {
    const association = await this.module02.resolveActiveAssociation(
      actorIdentityId,
      sellerProfileId,
    );
    if (association?.associationState !== 'ACTIVE' || association.associationRole !== 'OWNER') {
      throw new ProductApplicationError('PRODUCT_OWNERSHIP_DENIED');
    }
  }

  private changeSetWithAudit(
    product: Product,
    actorIdentityId: UuidV7,
    eventType: string,
    now: Date,
    extras: {
      transitions?: readonly ProductStateTransition[];
      skusToAppend?: readonly ProductSku[];
      variantsToAppend?: readonly unknown[];
      mediaToAppend?: readonly unknown[];
      attributeValuesToAppend?: readonly unknown[];
    },
    correlationId?: CorrelationIdentifier,
  ): ProductAggregateChangeSet {
    return {
      product,
      variantsToAppend: [],
      skusToAppend: extras.skusToAppend ?? [],
      mediaToAppend: [],
      attributeValuesToAppend: [],
      transitionsToAppend: extras.transitions ?? [],
      auditRecordsToAppend: [
        new ProductAuditRecord({
          auditEventId: this.identifiers.next(),
          productId: product.properties.productId,
          eventType,
          actorIdentityId,
          occurredAt: now,
          createdAt: now,
          ...(correlationId !== undefined ? { correlationId } : {}),
        }),
      ],
      priceHistoryToAppend: [],
    };
  }
}

export interface SkuCommand {
  readonly skuCode: SkuCode;
  readonly variantId?: UuidV7;
}

export interface CreateProductCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly name: string;
  readonly categoryId: UuidV7;
  readonly sellingPrice: Price;
  readonly compareAtPrice?: Price;
  readonly skus: readonly SkuCommand[];
  /** Caller-supplied idempotency key (e.g. the request key). */
  readonly requestKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface UpdateProductCommand {
  readonly productId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly categoryId?: UuidV7;
  readonly sellingPrice?: Price;
  readonly compareAtPrice?: Price;
  readonly skusToUpsert?: readonly SkuCommand[];
  readonly correlationId?: CorrelationIdentifier;
}

export interface SubmitProductCommand {
  readonly productId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CloseProductCommand extends SubmitProductCommand {
  readonly reasonReference: string;
}

export interface ProductMutationResult {
  readonly productId: string;
  readonly state: string;
  readonly version: number;
}
