import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CustomerProfile } from '../entities/customer-profile';
import { CustomerStateTransition } from '../entities/customer-state-transition';
import { CustomerDomainError } from '../errors/customer-domain.error';
import { isTerminalCustomerState, type CustomerState } from '../value-objects/customer-state';

/**
 * WEMP-M06-SPEC-001 §5 (decision D-02). The pure, deterministic customer
 * lifecycle state machine. Deny by default and fail closed: any unknown,
 * missing, terminal, same-state, actor-forbidden, or reason-less transition
 * is rejected with a typed CustomerDomainError. Every accepted transition
 * yields an append-only CustomerStateTransition episode; the caller persists
 * it atomically with the version-guarded profile update.
 *
 * Actor model (approved §5): only an ADMIN holding the proposed
 * `customer.lifecycle.manage` permission may transition a customer profile,
 * and every transition requires a mandatory non-disclosing reason reference.
 * No self-service transition exists in the approved lifecycle.
 */
export type CustomerActorKind = 'ADMIN';

export interface CustomerActor {
  readonly identityId: UuidV7;
  readonly kind: CustomerActorKind;
}

export interface CustomerTransitionCommand {
  readonly customerProfile: CustomerProfile;
  readonly toState: CustomerState;
  readonly actor: CustomerActor;
  readonly now: Date;
  /** Caller-generated UUIDv7 for the append-only transition episode. */
  readonly transitionId: UuidV7;
  /** Mandatory on every transition (WEMP-M06-SPEC-001 §5). */
  readonly reasonReference: string;
  /**
   * D-11 optimistic-concurrency guard: the aggregate version the caller
   * observed. When supplied and not matching the profile version, the
   * transition is rejected as stale (fail closed).
   */
  readonly expectedVersion?: number;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
}

interface TransitionRule {
  readonly actors: readonly CustomerActorKind[];
  readonly reasonRequired: boolean;
}

/**
 * The complete transition table from WEMP-M06-SPEC-001 §5. Same-state
 * transitions, terminal states, and any (from, to) pair absent from this map
 * are forbidden (fail closed).
 */
const TRANSITION_TABLE: Readonly<
  Partial<Record<CustomerState, Readonly<Partial<Record<CustomerState, TransitionRule>>>>>
> = {
  ACTIVE: {
    SUSPENDED: { actors: ['ADMIN'], reasonRequired: true },
    CLOSED: { actors: ['ADMIN'], reasonRequired: true },
  },
  SUSPENDED: {
    ACTIVE: { actors: ['ADMIN'], reasonRequired: true },
    CLOSED: { actors: ['ADMIN'], reasonRequired: true },
  },
  CLOSED: {},
};

export class CustomerLifecycle {
  /**
   * Validates the requested transition and returns the append-only
   * CustomerStateTransition episode. Throws CustomerDomainError on any
   * violation (fail closed); does not mutate the profile.
   */
  public transition(command: CustomerTransitionCommand): CustomerStateTransition {
    const { customerProfile, toState, actor, now } = command;

    if (
      command.expectedVersion !== undefined &&
      command.expectedVersion !== customerProfile.properties.aggregateVersion.value
    ) {
      throw new CustomerDomainError('CUSTOMER_STATE_CONFLICT');
    }
    if (isTerminalCustomerState(customerProfile.properties.state)) {
      throw new CustomerDomainError('CUSTOMER_STATE_CONFLICT');
    }
    if (customerProfile.properties.state === toState) {
      throw new CustomerDomainError('CUSTOMER_STATE_CONFLICT');
    }

    const rule = TRANSITION_TABLE[customerProfile.properties.state]?.[toState];
    if (rule === undefined) {
      throw new CustomerDomainError('CUSTOMER_TRANSITION_FORBIDDEN');
    }
    if (!rule.actors.includes(actor.kind)) {
      throw new CustomerDomainError('CUSTOMER_TRANSITION_FORBIDDEN');
    }
    if (rule.reasonRequired && command.reasonReference.trim().length === 0) {
      throw new CustomerDomainError('CUSTOMER_REASON_REQUIRED');
    }

    return new CustomerStateTransition({
      transitionId: command.transitionId,
      customerProfileId: customerProfile.properties.customerProfileId,
      fromState: customerProfile.properties.state,
      toState,
      stateVersion: customerProfile.properties.aggregateVersion.value + 1,
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
  public canTransition(command: CustomerTransitionCommand): boolean {
    try {
      this.transition(command);
      return true;
    } catch (error) {
      if (error instanceof CustomerDomainError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Returns the version-guarded profile in the new state. State-specific
   * timestamps are maintained (suspendedAt, closedAt); updatedAt and
   * aggregateVersion are always advanced.
   */
  public updatedProfile(
    customerProfile: CustomerProfile,
    toState: CustomerState,
    now: Date,
  ): CustomerProfile {
    const properties = customerProfile.properties;
    return new CustomerProfile({
      ...properties,
      state: toState,
      ...(toState === 'SUSPENDED' ? { suspendedAt: now } : {}),
      ...(toState === 'CLOSED' ? { closedAt: now } : {}),
      updatedAt: now,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
    });
  }

  /**
   * WEMP-M06-SPEC-001 §5. Self-service profile mutations are permitted only
   * while ACTIVE; SUSPENDED and CLOSED deny mutations (fail closed). Updates
   * never change lifecycle state and never create a state-transition episode.
   */
  public assertCanMutate(state: CustomerState): void {
    if (state !== 'ACTIVE') {
      throw new CustomerDomainError('CUSTOMER_UPDATE_FORBIDDEN');
    }
  }

  /**
   * WEMP-M06-SPEC-001 §5. Self-service reads are permitted while ACTIVE and
   * (per explicit grant only) SUSPENDED; CLOSED denies self-service reads.
   * Administrative audit visibility is governed separately by the Module 02
   * grant (customer.audit.view, proposed).
   */
  public assertCanSelfRead(state: CustomerState): void {
    if (state === 'CLOSED') {
      throw new CustomerDomainError('CUSTOMER_READ_FORBIDDEN');
    }
  }
}
