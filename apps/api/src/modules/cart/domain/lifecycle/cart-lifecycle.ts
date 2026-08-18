import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { Cart } from '../entities/cart';
import { CartStateTransition } from '../entities/cart-state-transition';
import { CartDomainError } from '../errors/cart-domain.error';
import { isTerminalCartState, type CartState } from '../value-objects/cart-state';

/**
 * WEMP-M07-SPEC-001 (decisions D-07/D-04/D-18). The pure, deterministic
 * cart lifecycle state machine. Deny by default and fail closed: any
 * unknown, missing, terminal, same-state, actor-forbidden, or reason-less
 * transition is rejected with a typed CartDomainError. Every accepted
 * transition yields an append-only CartStateTransition episode; the
 * caller persists it atomically with the version-guarded cart update.
 *
 * Transition table (D-07):
 *   ACTIVE     → CHECKED_OUT  (customer checkout handoff)
 *   ACTIVE     → AUTO_EXPIRED (system: abandoned cart, 30-day TTL)
 *   CHECKED_OUT → ARCHIVED    (system: post-checkout retention)
 *   AUTO_EXPIRED → ARCHIVED   (system: post-expiry retention)
 *
 * ARCHIVED is terminal — no transition out.
 *
 * Actor model (D-07): customer or system for self-service; admin for
 * admin lifecycle management (freeze/unfreeze/delete — deferred to M07-M4).
 */
export type CartActorKind = 'CUSTOMER' | 'SYSTEM' | 'ADMIN';

export interface CartActor {
  readonly identityId: UuidV7;
  readonly kind: CartActorKind;
}

export interface CartTransitionCommand {
  readonly cart: Cart;
  readonly toState: CartState;
  readonly actor: CartActor;
  readonly now: Date;
  readonly transitionId: UuidV7;
  readonly reasonReference: string;
  readonly expectedVersion?: number;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
}

interface TransitionRule {
  readonly actors: readonly CartActorKind[];
  readonly reasonRequired: boolean;
}

const TRANSITION_TABLE: Readonly<
  Partial<Record<CartState, Readonly<Partial<Record<CartState, TransitionRule>>>>>
> = {
  ACTIVE: {
    CHECKED_OUT: { actors: ['CUSTOMER'], reasonRequired: false },
    AUTO_EXPIRED: { actors: ['SYSTEM'], reasonRequired: true },
  },
  CHECKED_OUT: {
    ARCHIVED: { actors: ['SYSTEM'], reasonRequired: true },
  },
  AUTO_EXPIRED: {
    ARCHIVED: { actors: ['SYSTEM'], reasonRequired: true },
  },
  ARCHIVED: {},
};

export class CartLifecycle {
  /**
   * Validates the requested transition and returns the append-only
   * CartStateTransition episode. Throws CartDomainError on any
   * violation (fail closed); does not mutate the cart.
   */
  public transition(command: CartTransitionCommand): CartStateTransition {
    const { cart, toState, actor, now } = command;

    if (
      command.expectedVersion !== undefined &&
      command.expectedVersion !== cart.properties.aggregateVersion.value
    ) {
      throw new CartDomainError('CART_STALE_VERSION');
    }
    if (isTerminalCartState(cart.properties.state)) {
      throw new CartDomainError('CART_STATE_CONFLICT');
    }
    if (cart.properties.state === toState) {
      throw new CartDomainError('CART_STATE_CONFLICT');
    }

    const rule = TRANSITION_TABLE[cart.properties.state]?.[toState];
    if (rule === undefined) {
      throw new CartDomainError('CART_TRANSITION_FORBIDDEN');
    }
    if (!rule.actors.includes(actor.kind)) {
      throw new CartDomainError('CART_TRANSITION_FORBIDDEN');
    }
    if (rule.reasonRequired && command.reasonReference.trim().length === 0) {
      throw new CartDomainError('CART_REASON_REQUIRED');
    }

    return new CartStateTransition({
      transitionId: command.transitionId,
      cartId: cart.properties.cartId,
      fromState: cart.properties.state,
      toState,
      stateVersion: cart.properties.aggregateVersion.value + 1,
      actorIdentityId: actor.identityId,
      actorKind: actor.kind,
      transitionedAt: now,
      createdAt: now,
      reasonReference: command.reasonReference,
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
  public canTransition(command: CartTransitionCommand): boolean {
    try {
      this.transition(command);
      return true;
    } catch (error) {
      if (error instanceof CartDomainError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Returns the version-guarded cart in the new state. updatedAt and
   * aggregateVersion are always advanced. expiresAt is cleared on
   * terminal states (no further expiry needed).
   */
  public updatedCart(cart: Cart, toState: CartState, now: Date): Cart {
    const properties = cart.properties;
    const isTerminal = isTerminalCartState(toState);
    return new Cart({
      cartId: properties.cartId,
      customerProfileId: properties.customerProfileId,
      state: toState,
      totalLines: properties.totalLines,
      totalItems: properties.totalItems,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
      createdAt: properties.createdAt,
      updatedAt: now,
      ...(isTerminal
        ? {}
        : properties.expiresAt !== undefined
          ? { expiresAt: properties.expiresAt }
          : {}),
      ...(properties.correlationId !== undefined
        ? { correlationId: properties.correlationId }
        : {}),
    });
  }

  /**
   * WEMP-M07-SPEC-001 (decision D-07). Self-service cart mutations are
   * permitted only while ACTIVE; terminal states deny mutations (fail
   * closed). Updates never change lifecycle state and never create a
   * state-transition episode.
   */
  public assertCanMutate(state: CartState): void {
    if (state !== 'ACTIVE') {
      throw new CartDomainError('CART_UPDATE_FORBIDDEN');
    }
  }

  /**
   * WEMP-M07-SPEC-001. Self-service reads are permitted while ACTIVE;
   * CHECKED_OUT and ARCHIVED deny self-service reads (cart is no longer
   * editable). AUTO_EXPIRED also denies reads (cart is abandoned).
   */
  public assertCanSelfRead(state: CartState): void {
    if (state !== 'ACTIVE') {
      throw new CartDomainError('CART_READ_FORBIDDEN');
    }
  }
}
