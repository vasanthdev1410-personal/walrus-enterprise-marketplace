import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { PaymentState } from '../value-objects/payment-state';

/**
 * WEMP-M09-SPEC-001 (M09-M1, decision D-03). An append-only record of
 * a single payment state transition. Every accepted transition yields
 * one of these episodes; the caller persists it atomically with the
 * version-guarded payment update. Identical pattern to M08
 * OrderStateTransition and M07 CartStateTransition.
 */
export interface PaymentStateTransitionProperties {
  readonly transitionId: UuidV7;
  readonly paymentId: UuidV7;
  readonly fromState: PaymentState;
  readonly toState: PaymentState;
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

export class PaymentStateTransition {
  public readonly properties: Readonly<PaymentStateTransitionProperties>;

  public constructor(properties: PaymentStateTransitionProperties) {
    if (properties.fromState === properties.toState) {
      throw new Error('Payment state transition fromState and toState must differ');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
