import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { Order } from '../entities/order';
import { OrderStateTransition } from '../entities/order-state-transition';
import { OrderDomainError } from '../errors/order-domain.error';
import { isTerminalOrderState, type OrderState } from '../value-objects/order-state';

/**
 * WEMP-M08-SPEC-001 (decisions D-01/D-02/D-04). The pure, deterministic
 * order lifecycle state machine. Deny by default and fail closed: any
 * unknown, missing, terminal, same-state, actor-forbidden, or reason-less
 * transition is rejected with a typed OrderDomainError. Every accepted
 * transition yields an append-only OrderStateTransition episode; the
 * caller persists it atomically with the version-guarded order update.
 *
 * Transition table (D-01):
 *   PENDING    → CONFIRMED  (M09: payment initiation callback)
 *   PENDING    → CANCELLED  (customer or admin: before payment)
 *   CONFIRMED  → PAID       (M09: payment completion callback)
 *   CONFIRMED  → CANCELLED  (admin: pre-shipment cancellation)
 *   PAID       → SHIPPED    (M10: shipping dispatch callback)
 *   SHIPPED    → DELIVERED  (M10: delivery confirmation callback)
 *   DELIVERED  → CLOSED     (system or admin: order completion)
 *
 * DELIVERED, CANCELLED, and CLOSED are terminal — no transitions out.
 *
 * Actor model (D-01): customer for self-service; system for callbacks
 * (M09/M10); admin for administrative lifecycle management.
 */
export type OrderActorKind = 'CUSTOMER' | 'SYSTEM' | 'ADMIN';

export interface OrderActor {
  readonly identityId: UuidV7;
  readonly kind: OrderActorKind;
}

export interface OrderTransitionCommand {
  readonly order: Order;
  readonly toState: OrderState;
  readonly actor: OrderActor;
  readonly now: Date;
  readonly transitionId: UuidV7;
  readonly reasonReference: string;
  readonly expectedVersion?: number;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
}

interface TransitionRule {
  readonly actors: readonly OrderActorKind[];
  readonly reasonRequired: boolean;
}

const TRANSITION_TABLE: Readonly<
  Partial<Record<OrderState, Readonly<Partial<Record<OrderState, TransitionRule>>>>>
> = {
  PENDING: {
    CONFIRMED: { actors: ['SYSTEM', 'ADMIN'], reasonRequired: false },
    CANCELLED: { actors: ['CUSTOMER', 'ADMIN'], reasonRequired: true },
  },
  CONFIRMED: {
    PAID: { actors: ['SYSTEM'], reasonRequired: false },
    CANCELLED: { actors: ['ADMIN'], reasonRequired: true },
  },
  PAID: {
    SHIPPED: { actors: ['SYSTEM', 'ADMIN'], reasonRequired: false },
  },
  SHIPPED: {
    DELIVERED: { actors: ['SYSTEM', 'ADMIN'], reasonRequired: false },
  },
  DELIVERED: {
    CLOSED: { actors: ['SYSTEM', 'ADMIN'], reasonRequired: false },
  },
  CANCELLED: {},
  CLOSED: {},
};

export class OrderLifecycle {
  /**
   * Validates the requested transition and returns the append-only
   * OrderStateTransition episode. Throws OrderDomainError on any
   * violation (fail closed); does not mutate the order.
   */
  public transition(command: OrderTransitionCommand): OrderStateTransition {
    const { order, toState, actor, now } = command;

    if (
      command.expectedVersion !== undefined &&
      command.expectedVersion !== order.properties.aggregateVersion.value
    ) {
      throw new OrderDomainError('ORDER_STALE_VERSION');
    }
    if (isTerminalOrderState(order.properties.state)) {
      throw new OrderDomainError('ORDER_STATE_CONFLICT');
    }
    if (order.properties.state === toState) {
      throw new OrderDomainError('ORDER_STATE_CONFLICT');
    }

    const rule = TRANSITION_TABLE[order.properties.state]?.[toState];
    if (rule === undefined) {
      throw new OrderDomainError('ORDER_TRANSITION_FORBIDDEN');
    }
    if (!rule.actors.includes(actor.kind)) {
      throw new OrderDomainError('ORDER_TRANSITION_FORBIDDEN');
    }
    if (rule.reasonRequired && command.reasonReference.trim().length === 0) {
      throw new OrderDomainError('ORDER_REASON_REQUIRED');
    }

    return new OrderStateTransition({
      transitionId: command.transitionId,
      orderId: order.properties.orderId,
      fromState: order.properties.state,
      toState,
      stateVersion: order.properties.aggregateVersion.value + 1,
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
  public canTransition(command: OrderTransitionCommand): boolean {
    try {
      this.transition(command);
      return true;
    } catch (error) {
      if (error instanceof OrderDomainError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Returns the version-guarded order in the new state. updatedAt and
   * aggregateVersion are always advanced.
   */
  public updatedOrder(order: Order, toState: OrderState, now: Date): Order {
    const properties = order.properties;
    return new Order({
      orderId: properties.orderId,
      customerProfileId: properties.customerProfileId,
      snapshotId: properties.snapshotId,
      cartId: properties.cartId,
      state: toState,
      totalLines: properties.totalLines,
      totalItems: properties.totalItems,
      subtotalAmountCents: properties.subtotalAmountCents,
      subtotalCurrency: properties.subtotalCurrency,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
      createdAt: properties.createdAt,
      updatedAt: now,
      ...(properties.correlationId !== undefined
        ? { correlationId: properties.correlationId }
        : {}),
    });
  }

  /**
   * WEMP-M08-SPEC-001 (decision D-01). Self-service order mutations are
   * permitted only while PENDING; terminal states deny mutations (fail
   * closed). Updates never change lifecycle state and never create a
   * state-transition episode.
   */
  public assertCanMutate(state: OrderState): void {
    if (state !== 'PENDING') {
      throw new OrderDomainError('ORDER_UPDATE_FORBIDDEN');
    }
  }

  /**
   * WEMP-M08-SPEC-001. Self-service reads are permitted for PENDING,
   * CONFIRMED, PAID, SHIPPED orders. DELIVERED, CANCELLED, CLOSED deny
   * self-service reads (order is terminal).
   */
  public assertCanSelfRead(state: OrderState): void {
    // DELIVERED, CANCELLED, and CLOSED deny self-service reads.
    // DELIVERED is not terminal for transitions (→ CLOSED), but
    // self-service reads are not permitted after delivery.
    if (isTerminalOrderState(state) || state === 'DELIVERED') {
      throw new OrderDomainError('ORDER_READ_FORBIDDEN');
    }
  }
}
