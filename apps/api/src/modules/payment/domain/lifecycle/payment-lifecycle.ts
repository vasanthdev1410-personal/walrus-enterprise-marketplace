import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { Payment } from '../entities/payment';
import { PaymentStateTransition } from '../entities/payment-state-transition';
import { PaymentDomainError } from '../errors/payment-domain.error';
import { isTerminalPaymentState, type PaymentState } from '../value-objects/payment-state';

/**
 * WEMP-M09-SPEC-001 (M09-M1, decisions D-03/D-12). The pure,
 * deterministic payment lifecycle state machine. Deny by default and
 * fail closed: any unknown, missing, terminal, same-state, or
 * forbidden transition is rejected with a typed PaymentDomainError.
 * Every accepted transition yields an append-only
 * PaymentStateTransition episode; the caller persists it atomically
 * with the version-guarded payment update.
 *
 * Transition table (D-03):
 *   PENDING        → PROCESSING    (customer: initiated payment with provider)
 *   PENDING        → EXPIRED       (system: payment window timeout)
 *   PROCESSING     → CAPTURED      (system: provider webhook — payment.captured)
 *   PROCESSING     → FAILED        (system: provider webhook — payment.failed)
 *   PROCESSING     → REFUND_PENDING (admin: initiate refund on captured payment —
 *                                    NOTE: this is PENDING→REFUND_PENDING for
 *                                    captured payments that need post-capture refund)
 *   CAPTURED       → REFUND_PENDING (admin: initiate refund on captured payment)
 *   REFUND_PENDING → REFUNDED       (system: provider webhook — refund.created)
 *   REFUND_PENDING → FAILED         (system: provider webhook — refund.failed)
 *
 * CAPTURED, FAILED, EXPIRED, and REFUNDED are terminal — no transitions out.
 */
export type PaymentActorKind = 'CUSTOMER' | 'SYSTEM' | 'ADMIN';

export interface PaymentActor {
  readonly identityId: UuidV7;
  readonly kind: PaymentActorKind;
}

export interface PaymentTransitionCommand {
  readonly payment: Payment;
  readonly toState: PaymentState;
  readonly actor: PaymentActor;
  readonly now: Date;
  readonly transitionId: UuidV7;
  readonly reasonReference: string;
  readonly expectedVersion?: number;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
}

interface TransitionRule {
  readonly actors: readonly PaymentActorKind[];
  readonly reasonRequired: boolean;
}

const TRANSITION_TABLE: Readonly<
  Partial<Record<PaymentState, Readonly<Partial<Record<PaymentState, TransitionRule>>>>>
> = {
  PENDING: {
    PROCESSING: { actors: ['CUSTOMER'], reasonRequired: false },
    EXPIRED: { actors: ['SYSTEM'], reasonRequired: false },
  },
  PROCESSING: {
    CAPTURED: { actors: ['SYSTEM'], reasonRequired: false },
    FAILED: { actors: ['SYSTEM'], reasonRequired: false },
  },
  CAPTURED: {
    REFUND_PENDING: { actors: ['ADMIN'], reasonRequired: true },
  },
  REFUND_PENDING: {
    REFUNDED: { actors: ['SYSTEM'], reasonRequired: false },
    FAILED: { actors: ['SYSTEM'], reasonRequired: false },
  },
  // Terminal states — no transitions out.
  FAILED: {},
  EXPIRED: {},
  REFUNDED: {},
};

export class PaymentLifecycle {
  /**
   * Validates the requested transition and returns the append-only
   * PaymentStateTransition episode. Throws PaymentDomainError on any
   * violation (fail closed); does not mutate the payment.
   */
  public transition(command: PaymentTransitionCommand): PaymentStateTransition {
    const { payment, toState, actor, now } = command;

    if (
      command.expectedVersion !== undefined &&
      command.expectedVersion !== payment.properties.aggregateVersion.value
    ) {
      throw new PaymentDomainError('PAYMENT_STALE_VERSION');
    }
    if (isTerminalPaymentState(payment.properties.state)) {
      throw new PaymentDomainError('PAYMENT_STATE_CONFLICT');
    }
    if (payment.properties.state === toState) {
      throw new PaymentDomainError('PAYMENT_STATE_CONFLICT');
    }

    const rule = TRANSITION_TABLE[payment.properties.state]?.[toState];
    if (rule === undefined) {
      throw new PaymentDomainError('PAYMENT_TRANSITION_FORBIDDEN');
    }
    if (!rule.actors.includes(actor.kind)) {
      throw new PaymentDomainError('PAYMENT_TRANSITION_FORBIDDEN');
    }
    if (rule.reasonRequired && command.reasonReference.trim().length === 0) {
      throw new PaymentDomainError('PAYMENT_REASON_REQUIRED');
    }

    return new PaymentStateTransition({
      transitionId: command.transitionId,
      paymentId: payment.properties.paymentId,
      fromState: payment.properties.state,
      toState,
      stateVersion: payment.properties.aggregateVersion.value + 1,
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
  public canTransition(command: PaymentTransitionCommand): boolean {
    try {
      this.transition(command);
      return true;
    } catch (error) {
      if (error instanceof PaymentDomainError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Returns the version-guarded payment in the new state. updatedAt and
   * aggregateVersion are always advanced.
   */
  public updatedPayment(payment: Payment, toState: PaymentState, now: Date): Payment {
    const p = payment.properties;
    return new Payment({
      paymentId: p.paymentId,
      orderId: p.orderId,
      customerProfileId: p.customerProfileId,
      state: toState,
      amountCents: p.amountCents,
      currency: p.currency,
      provider: p.provider,
      providerOrderId: p.providerOrderId,
      providerPaymentId: p.providerPaymentId,
      idempotencyKey: p.idempotencyKey,
      aggregateVersion: new AggregateVersion(p.aggregateVersion.value + 1),
      createdAt: p.createdAt,
      updatedAt: now,
      ...(p.correlationId !== undefined ? { correlationId: p.correlationId } : {}),
    });
  }
}
