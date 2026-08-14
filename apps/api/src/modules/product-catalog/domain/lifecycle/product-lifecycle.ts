import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { Product } from '../entities/product';
import { ProductStateTransition } from '../entities/product-state-transition';
import { ProductDomainError } from '../errors/product-domain.error';
import { isTerminalProductState, type ProductState } from '../value-objects/product-state';

/**
 * WEMP-M04-SPEC-001 §5 (decision D-02). The pure, deterministic product
 * lifecycle state machine. Deny by default and fail closed: any unknown,
 * missing, terminal, same-state, actor-forbidden, reason-less,
 * precondition-failed, or separation-of-duties-violating transition is
 * rejected with a typed ProductDomainError. Every accepted transition yields
 * an append-only ProductStateTransition episode; the caller persists it
 * atomically with the version-guarded product update.
 *
 * Actor model (WEMP-M04-SPEC-001 §13/§14, decision D-10):
 *  - SELLER_OWNER: the OWNER association of the selling organization
 *    (SELLER role; management actions are owner-only, decision D-01)
 *  - SELLER_MEMBER: a non-owner member (SELLER role; read-only, no
 *    lifecycle authority)
 *  - ADMIN_REVIEWER: admin assigned to review (product.review.decide)
 *  - ADMIN_APPROVER: admin deciding approve/reject (product.review.decide),
 *    subject to reviewer != approver separation of duties
 *  - ADMIN: admin performing administrative actions (e.g. initiating
 *    re-moderation of a PUBLISHED product)
 *  - SYSTEM: automatic approval-to-publication gate (D-12 publication gate)
 */
export type ProductActorKind =
  'SELLER_OWNER' | 'SELLER_MEMBER' | 'ADMIN_REVIEWER' | 'ADMIN_APPROVER' | 'ADMIN' | 'SYSTEM';

export interface ProductActor {
  readonly identityId: UuidV7;
  readonly kind: ProductActorKind;
}

export interface ProductTransitionCommand {
  readonly product: Product;
  readonly toState: ProductState;
  readonly actor: ProductActor;
  readonly now: Date;
  /** Caller-generated UUIDv7 for the append-only transition episode. */
  readonly transitionId: UuidV7;
  readonly reasonReference?: string;
  /** SoD: the identity that moved the product into UNDER_REVIEW. Required for decisions out of UNDER_REVIEW. */
  readonly reviewerIdentityId?: UuidV7;
  /** DRAFT → SUBMITTED precondition (ProductCatalogPolicy.isSubmissionComplete). */
  readonly submissionComplete?: boolean;
  /** APPROVED → PUBLISHED precondition: the publication gate passed (decision D-12). */
  readonly publicationGranted?: boolean;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
}

interface TransitionRule {
  readonly actors: readonly ProductActorKind[];
  readonly reasonRequired: boolean;
}

/**
 * The complete transition table from WEMP-M04-SPEC-001 §5 (decision D-02).
 * Same-state transitions, terminal states, and any (from, to) pair absent
 * from this map are forbidden (fail closed).
 *
 * Re-moderation (invariant 3): edits to a PUBLISHED product start a new
 * review cycle before re-publication — PUBLISHED → CORRECTIONS_REQUESTED
 * (administrative re-moderation) and PUBLISHED → UNPUBLISHED (owner
 * withdrawal), followed by CORRECTIONS_REQUESTED/UNPUBLISHED → SUBMITTED.
 */
const TRANSITION_TABLE: Readonly<
  Partial<Record<ProductState, Readonly<Partial<Record<ProductState, TransitionRule>>>>>
> = {
  DRAFT: {
    SUBMITTED: { actors: ['SELLER_OWNER'], reasonRequired: false },
  },
  SUBMITTED: {
    UNDER_REVIEW: { actors: ['ADMIN_REVIEWER'], reasonRequired: false },
    REJECTED: { actors: ['ADMIN_APPROVER'], reasonRequired: true },
  },
  UNDER_REVIEW: {
    CORRECTIONS_REQUESTED: { actors: ['ADMIN_REVIEWER'], reasonRequired: true },
    APPROVED: { actors: ['ADMIN_APPROVER'], reasonRequired: false },
    REJECTED: { actors: ['ADMIN_APPROVER'], reasonRequired: true },
  },
  CORRECTIONS_REQUESTED: {
    SUBMITTED: { actors: ['SELLER_OWNER'], reasonRequired: false },
    REJECTED: { actors: ['ADMIN_APPROVER'], reasonRequired: true },
  },
  APPROVED: {
    PUBLISHED: { actors: ['SYSTEM'], reasonRequired: false },
    CLOSED: { actors: ['SELLER_OWNER', 'ADMIN'], reasonRequired: true },
  },
  PUBLISHED: {
    UNPUBLISHED: { actors: ['SELLER_OWNER'], reasonRequired: true },
    CORRECTIONS_REQUESTED: { actors: ['ADMIN'], reasonRequired: true },
    CLOSED: { actors: ['SELLER_OWNER', 'ADMIN'], reasonRequired: true },
  },
  UNPUBLISHED: {
    SUBMITTED: { actors: ['SELLER_OWNER'], reasonRequired: false },
    CLOSED: { actors: ['SELLER_OWNER', 'ADMIN'], reasonRequired: true },
  },
  REJECTED: {},
  CLOSED: {},
};

export class ProductLifecycle {
  /**
   * Validates the requested transition and returns the append-only
   * ProductStateTransition episode. Throws ProductDomainError on any
   * violation (fail closed); does not mutate the product.
   */
  public transition(command: ProductTransitionCommand): ProductStateTransition {
    const { product, toState, actor, now } = command;

    if (isTerminalProductState(product.properties.state)) {
      throw new ProductDomainError('PRODUCT_STATE_CONFLICT');
    }
    if (product.properties.state === toState) {
      throw new ProductDomainError('PRODUCT_STATE_CONFLICT');
    }

    const rule = TRANSITION_TABLE[product.properties.state]?.[toState];
    if (rule === undefined) {
      throw new ProductDomainError('PRODUCT_TRANSITION_FORBIDDEN');
    }
    if (!rule.actors.includes(actor.kind)) {
      throw new ProductDomainError('PRODUCT_TRANSITION_FORBIDDEN');
    }
    if (
      rule.reasonRequired &&
      (command.reasonReference === undefined || command.reasonReference.trim().length === 0)
    ) {
      throw new ProductDomainError('PRODUCT_REASON_REQUIRED');
    }

    if (product.properties.state === 'DRAFT' && toState === 'SUBMITTED') {
      if (command.submissionComplete !== true) {
        throw new ProductDomainError('PRODUCT_PRECONDITION_FAILED');
      }
    }
    if (product.properties.state === 'UNDER_REVIEW' && toState === 'APPROVED') {
      this.assertSeparationOfDuties(command);
    }
    if (product.properties.state === 'UNDER_REVIEW' && toState === 'REJECTED') {
      this.assertSeparationOfDuties(command);
    }
    if (product.properties.state === 'APPROVED' && toState === 'PUBLISHED') {
      if (command.publicationGranted !== true) {
        throw new ProductDomainError('PRODUCT_PRECONDITION_FAILED');
      }
    }

    return new ProductStateTransition({
      productStateTransitionId: command.transitionId,
      productId: product.properties.productId,
      fromState: product.properties.state,
      toState,
      stateVersion: product.properties.aggregateVersion.value + 1,
      actorIdentityId: actor.identityId,
      actorKind: actor.kind,
      transitionedAt: now,
      createdAt: now,
      ...(command.reasonReference !== undefined
        ? { reasonReference: command.reasonReference }
        : {}),
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
      ...(command.causationId !== undefined ? { causationId: command.causationId } : {}),
      ...(command.sourceReference !== undefined
        ? { sourceReference: command.sourceReference }
        : {}),
    });
  }

  /**
   * Returns true when the transition is permitted under the command; never
   * throws. Used for decision checks and tests.
   */
  public canTransition(command: ProductTransitionCommand): boolean {
    try {
      this.transition(command);
      return true;
    } catch (error) {
      if (error instanceof ProductDomainError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Returns the version-guarded product in the new state. State-specific
   * timestamps are maintained (submittedAt, approvedAt, publishedAt,
   * closedAt); updatedAt and aggregateVersion are always advanced.
   */
  public updatedProduct(product: Product, toState: ProductState, now: Date): Product {
    const properties = product.properties;
    return new Product({
      ...properties,
      state: toState,
      ...(toState === 'SUBMITTED' ? { submittedAt: now } : {}),
      ...(toState === 'APPROVED' ? { approvedAt: now } : {}),
      ...(toState === 'PUBLISHED' ? { publishedAt: now } : {}),
      ...(toState === 'CLOSED' ? { closedAt: now } : {}),
      updatedAt: now,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
    });
  }

  /**
   * WEMP-M04-SPEC-001 §5 invariant 3 / decision D-02. Product definition
   * edits are permitted in DRAFT, CORRECTIONS_REQUESTED, UNPUBLISHED, and
   * (re-moderation) PUBLISHED; denied while locked for review or in
   * terminal/approval states (fail closed). Edits never change lifecycle
   * state directly and never create a state-transition episode; edits to a
   * PUBLISHED product must first move it into re-moderation.
   */
  public assertCanUpdate(state: ProductState): void {
    const updatable: readonly ProductState[] = ['DRAFT', 'CORRECTIONS_REQUESTED', 'UNPUBLISHED'];
    if (!updatable.includes(state)) {
      throw new ProductDomainError('PRODUCT_UPDATE_FORBIDDEN');
    }
  }

  /**
   * Separation of duties (WEMP-M04-SPEC-001 §13.4, decision D-10): the admin
   * who decides APPROVED/REJECTED out of UNDER_REVIEW must not be the
   * reviewer that placed the product in UNDER_REVIEW. The reviewer identity
   * is resolved from the transition log by the application layer and
   * supplied as reviewerIdentityId; its absence fails closed for decisions
   * out of UNDER_REVIEW.
   */
  private assertSeparationOfDuties(command: ProductTransitionCommand): void {
    const reviewer = command.reviewerIdentityId;
    if (reviewer === undefined) {
      throw new ProductDomainError('PRODUCT_SOD_VIOLATION');
    }
    if (reviewer.value === command.actor.identityId.value) {
      throw new ProductDomainError('PRODUCT_SOD_VIOLATION');
    }
  }
}
