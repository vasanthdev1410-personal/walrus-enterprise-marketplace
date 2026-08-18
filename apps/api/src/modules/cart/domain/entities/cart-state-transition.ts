import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CartState } from '../value-objects/cart-state';

/**
 * WEMP-M07-SPEC-001 (decisions D-07/D-11). Append-only lifecycle episode
 * log for the cart aggregate. Every state change (ACTIVE → CHECKED_OUT,
 * ACTIVE → AUTO_EXPIRED, etc.) requires a transition record. Records are
 * immutable once written and stateVersion is the aggregate version after
 * the transition. Cart creation establishes ACTIVE directly and is not a
 * transition episode (same pattern as M06 CustomerProfile).
 */
export interface CartStateTransitionProperties {
  readonly transitionId: UuidV7;
  readonly cartId: UuidV7;
  readonly fromState: CartState;
  readonly toState: CartState;
  readonly stateVersion: number;
  readonly actorIdentityId: UuidV7;
  readonly actorKind: string;
  readonly transitionedAt: Date;
  readonly createdAt: Date;
  readonly reasonReference: string;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
}

export class CartStateTransition {
  public readonly properties: Readonly<CartStateTransitionProperties>;

  public constructor(properties: CartStateTransitionProperties) {
    if (properties.fromState === properties.toState) {
      throw new Error('Cart state transition must change state');
    }
    if (!Number.isSafeInteger(properties.stateVersion) || properties.stateVersion < 1) {
      throw new Error('Cart state version must be a positive safe integer');
    }
    if (properties.actorKind.trim().length === 0) {
      throw new Error('Cart transition requires the actor kind');
    }

    if (properties.createdAt < properties.transitionedAt) {
      throw new Error('Cart transition createdAt cannot precede transitionedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
