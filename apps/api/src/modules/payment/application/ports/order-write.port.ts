import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';

/**
 * WEMP-M09-PLAN-001 M09-M3 (decision D-05). Minimal order state transition
 * port for Module 09 payment callbacks. M09 transitions orders through
 * the D-05 handoff boundary:
 * - PENDING → CONFIRMED (payment initiated)
 * - CONFIRMED → PAID (payment captured)
 *
 * The adapter wraps M08's OrderApplicationService.transitionOrder with
 * SYSTEM actor. Fail closed when the transition is rejected.
 */
export interface OrderWritePort {
  /** Transition an order to a new state (system actor). */
  transitionOrder(params: {
    readonly orderId: UuidV7;
    readonly toState: string;
    readonly reasonReference: string;
    readonly actorIdentityId: UuidV7;
    readonly correlationId?: CorrelationIdentifier;
  }): Promise<void>;
}
