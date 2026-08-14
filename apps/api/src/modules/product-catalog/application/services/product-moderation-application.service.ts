import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { ProductAuditRecord } from '../../domain/entities/product-audit-record';
import type { Product } from '../../domain/entities/product';
import type { ProductStateTransition } from '../../domain/entities/product-state-transition';
import type { ProductLifecycle } from '../../domain/lifecycle/product-lifecycle';
import type {
  ProductAggregateChangeSet,
  ProductCatalogRepository,
} from '../../domain/ports/product-catalog-repository.port';
import { ProductApplicationError } from '../errors/product-application.error';
import type { ProductAdminAuthorizationPort } from '../ports/product-admin-authorization.port';

/**
 * The reserved system actor identity for the APPROVED → PUBLISHED transition
 * (WEMP-M04-SPEC-001 §13, decision D-12). Publication is a SYSTEM-gated
 * transition; the episode records this reserved platform identity with
 * actorKind SYSTEM plus the correlation of the triggering admin decision. No
 * human can ever authenticate as this identifier.
 */
const PRODUCT_SYSTEM_ACTOR_IDENTITY = new UuidV7('0191310f-789a-7fff-8000-000000000002');

/**
 * WEMP-M04-PLAN-001 M04-M3 (decision D-10). Product moderation application
 * service. Pre-approval with separation of duties, mirroring the approved
 * Module 03 seller-onboarding pattern:
 * - claimReview: SUBMITTED → UNDER_REVIEW by an admin reviewer
 *   (product.review.decide); the reviewer identity is recorded in the
 *   transition episode.
 * - requestCorrections: UNDER_REVIEW → CORRECTIONS_REQUESTED with a reason.
 * - decideApproval / decideRejection: UNDER_REVIEW → APPROVED / REJECTED by
 *   a distinct approver (reviewer ≠ approver, resolved from the transition
 *   log — fail closed when unresolved).
 * - publishApproved: APPROVED → PUBLISHED through the SYSTEM gate (D-12);
 *   only PUBLISHED products are consumable by trading modules.
 * Every decision is version-guarded and audited; authorization is decided by
 * Module 02 through the admin port (no new role, D-10).
 */
export class ProductModerationApplicationService {
  public constructor(
    private readonly repository: ProductCatalogRepository,
    private readonly adminAuthorization: ProductAdminAuthorizationPort,
    private readonly lifecycle: ProductLifecycle,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
  ) {}

  /**
   * SUBMITTED → UNDER_REVIEW. The admin reviewer claims the product; the
   * reviewer identity is recorded in the transition episode so the later
   * approver can be verified as distinct (separation of duties, D-10).
   */
  public async claimReview(command: ModerationCommand): Promise<ProductMutationResult> {
    await this.assertAdmin(command.actorIdentityId);
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      product,
      toState: 'UNDER_REVIEW',
      actor: { identityId: command.actorIdentityId, kind: 'ADMIN_REVIEWER' },
      now,
      transitionId: this.identifiers.next(),
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProduct(product, 'UNDER_REVIEW', now);
    await this.repository.save(
      this.changeSet(
        updated,
        command.actorIdentityId,
        'PRODUCT_REVIEW_CLAIMED',
        now,
        [transition],
        command.correlationId,
      ),
      product.properties.aggregateVersion,
    );
    return {
      productId: command.productId.value,
      state: 'UNDER_REVIEW',
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * UNDER_REVIEW → CORRECTIONS_REQUESTED by the reviewer with a mandatory
   * reason (new review cycle after seller corrections, D-02).
   */
  public async requestCorrections(command: CorrectionsCommand): Promise<ProductMutationResult> {
    await this.assertAdmin(command.actorIdentityId);
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      product,
      toState: 'CORRECTIONS_REQUESTED',
      actor: { identityId: command.actorIdentityId, kind: 'ADMIN_REVIEWER' },
      now,
      transitionId: this.identifiers.next(),
      reasonReference: command.reasonReference,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProduct(product, 'CORRECTIONS_REQUESTED', now);
    await this.repository.save(
      this.changeSet(
        updated,
        command.actorIdentityId,
        'PRODUCT_CORRECTIONS_REQUESTED',
        now,
        [transition],
        command.correlationId,
      ),
      product.properties.aggregateVersion,
    );
    return {
      productId: command.productId.value,
      state: 'CORRECTIONS_REQUESTED',
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * UNDER_REVIEW → APPROVED. Separation of duties (D-10): the approver must
   * not be the reviewer that claimed the review. The reviewer identity is
   * resolved from the transition log; failure to resolve fails closed.
   */
  public async decideApproval(command: ModerationCommand): Promise<ProductMutationResult> {
    await this.assertAdmin(command.actorIdentityId);
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }

    const reviewerIdentityId = await this.resolveReviewer(command.productId);
    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      product,
      toState: 'APPROVED',
      actor: { identityId: command.actorIdentityId, kind: 'ADMIN_APPROVER' },
      now,
      transitionId: this.identifiers.next(),
      reviewerIdentityId,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProduct(product, 'APPROVED', now);
    await this.repository.save(
      this.changeSet(
        updated,
        command.actorIdentityId,
        'PRODUCT_APPROVED',
        now,
        [transition],
        command.correlationId,
      ),
      product.properties.aggregateVersion,
    );
    return {
      productId: command.productId.value,
      state: 'APPROVED',
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * UNDER_REVIEW → REJECTED (terminal, D-02) with a mandatory reason.
   * Separation of duties enforced as for approval.
   */
  public async decideRejection(command: RejectionCommand): Promise<ProductMutationResult> {
    await this.assertAdmin(command.actorIdentityId);
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }

    const reviewerIdentityId = await this.resolveReviewer(command.productId);
    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      product,
      toState: 'REJECTED',
      actor: { identityId: command.actorIdentityId, kind: 'ADMIN_APPROVER' },
      now,
      transitionId: this.identifiers.next(),
      reviewerIdentityId,
      reasonReference: command.reasonReference,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
    });
    const updated = this.lifecycle.updatedProduct(product, 'REJECTED', now);
    await this.repository.save(
      this.changeSet(
        updated,
        command.actorIdentityId,
        'PRODUCT_REJECTED',
        now,
        [transition],
        command.correlationId,
      ),
      product.properties.aggregateVersion,
    );
    return {
      productId: command.productId.value,
      state: 'REJECTED',
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * APPROVED → PUBLISHED (D-12 publication gate). The transition is
   * SYSTEM-gated and only PUBLISHED products become consumable by trading
   * modules (05/07/08) through the fail-closed ProductCatalogReadPort. The
   * triggering admin must hold product.review.decide; the SYSTEM episode
   * records the reserved system identity with the admin's correlation.
   */
  public async publishApproved(command: ModerationCommand): Promise<ProductMutationResult> {
    await this.assertAdmin(command.actorIdentityId);
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }

    const now = this.clock.now();
    const transition = this.lifecycle.transition({
      product,
      toState: 'PUBLISHED',
      actor: { identityId: PRODUCT_SYSTEM_ACTOR_IDENTITY, kind: 'SYSTEM' },
      now,
      transitionId: this.identifiers.next(),
      publicationGranted: true,
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
      causationId: command.actorIdentityId,
    });
    const updated = this.lifecycle.updatedProduct(product, 'PUBLISHED', now);
    await this.repository.save(
      this.changeSet(
        updated,
        command.actorIdentityId,
        'PRODUCT_PUBLISHED',
        now,
        [transition],
        command.correlationId,
      ),
      product.properties.aggregateVersion,
    );
    return {
      productId: command.productId.value,
      state: 'PUBLISHED',
      version: updated.properties.aggregateVersion.value,
    };
  }

  /**
   * Resolves the reviewer identity that moved the product into UNDER_REVIEW
   * from the append-only transition log. Fail closed: no claim episode means
   * the decision is denied (PRODUCT_REVIEWER_UNRESOLVED).
   */
  private async resolveReviewer(productId: UuidV7): Promise<UuidV7> {
    const transitions = await this.repository.findTransitions(productId);
    for (let index = transitions.length - 1; index >= 0; index -= 1) {
      const episode = transitions[index];
      if (
        episode?.properties.toState === 'UNDER_REVIEW' &&
        episode.properties.actorKind === 'ADMIN_REVIEWER'
      ) {
        return episode.properties.actorIdentityId;
      }
    }
    throw new ProductApplicationError('PRODUCT_REVIEWER_UNRESOLVED');
  }

  private async assertAdmin(identityId: UuidV7): Promise<void> {
    const granted = await this.adminAuthorization.isGranted(identityId, 'product.review.decide');
    if (!granted) {
      throw new ProductApplicationError('PRODUCT_ADMIN_AUTHORIZATION_DENIED');
    }
  }

  private changeSet(
    product: Product,
    actorIdentityId: UuidV7,
    eventType: string,
    now: Date,
    transitions: readonly ProductStateTransition[],
    correlationId?: CorrelationIdentifier,
  ): ProductAggregateChangeSet {
    return {
      product,
      variantsToAppend: [],
      skusToAppend: [],
      mediaToAppend: [],
      attributeValuesToAppend: [],
      transitionsToAppend: transitions,
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

export interface ModerationCommand {
  readonly productId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CorrectionsCommand extends ModerationCommand {
  readonly reasonReference: string;
}

export interface RejectionCommand extends ModerationCommand {
  readonly reasonReference: string;
}

export interface ProductMutationResult {
  readonly productId: string;
  readonly state: string;
  readonly version: number;
}
