import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { OrderState } from '../value-objects/order-state';

/**
 * WEMP-M08-SPEC-001 (decision D-01). An append-only record of a single
 * order state transition. Every accepted transition yields one of these
 * episodes; the caller persists it atomically with the version-guarded
 * order update. Identical pattern to M07 CartStateTransition.
 */
export interface OrderStateTransitionProperties {
  readonly transitionId: UuidV7;
  readonly orderId: UuidV7;
  readonly fromState: OrderState;
  readonly toState: OrderState;
  readonly stateVersion: number;
  readonly actorIdentityId: UuidV7;
  readonly actorKind: string;
  readonly reasonReference: string;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
  readonly transitionedAt: Date;
  readonly createdAt: Date;
}

export class OrderStateTransition {
  public readonly properties: Readonly<OrderStateTransitionProperties>;

  public constructor(properties: OrderStateTransitionProperties) {
    if (properties.fromState === properties.toState) {
      throw new Error('Order state transition fromState and toState must differ');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
