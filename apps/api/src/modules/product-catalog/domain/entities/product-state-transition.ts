import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { ProductState } from '../value-objects/product-state';

/**
 * WEMP-M04-SPEC-001 §5/§17. Append-only lifecycle episode log. Every
 * transition requires an authenticated actor and a mandatory audit record;
 * transitions are immutable once written. The initial transition
 * (stateVersion 1) establishes DRAFT without a fromState; every later
 * transition names its fromState.
 */
export interface ProductStateTransitionProperties {
  readonly productStateTransitionId: UuidV7;
  readonly productId: UuidV7;
  readonly fromState?: ProductState;
  readonly toState: ProductState;
  readonly stateVersion: number;
  readonly actorIdentityId: UuidV7;
  readonly actorKind: string;
  readonly transitionedAt: Date;
  readonly createdAt: Date;
  readonly reasonReference?: string;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
}

export class ProductStateTransition {
  public readonly properties: Readonly<ProductStateTransitionProperties>;

  public constructor(properties: ProductStateTransitionProperties) {
    if (properties.fromState !== undefined && properties.fromState === properties.toState) {
      throw new Error('Product state transition must change state');
    }
    if (!Number.isSafeInteger(properties.stateVersion) || properties.stateVersion < 1) {
      throw new Error('Product state version must be a positive safe integer');
    }
    const isInitial = properties.stateVersion === 1;
    if (isInitial && (properties.fromState !== undefined || properties.toState !== 'DRAFT')) {
      throw new Error('Initial Product transition must establish DRAFT without fromState');
    }
    if (!isInitial && properties.fromState === undefined) {
      throw new Error('Non-initial Product transition requires fromState');
    }
    if (properties.actorKind.trim().length === 0) {
      throw new Error('Product transition requires the actor kind');
    }
    if (properties.createdAt < properties.transitionedAt) {
      throw new Error('Product transition createdAt cannot precede transitionedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
