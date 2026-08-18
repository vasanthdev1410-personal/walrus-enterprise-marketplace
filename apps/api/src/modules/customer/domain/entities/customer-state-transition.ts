import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CustomerState } from '../value-objects/customer-state';

/**
 * WEMP-M06-SPEC-001 §5/§13 (decision D-02). Append-only lifecycle episode
 * log. Every transition requires an authenticated ADMIN actor and a mandatory
 * non-disclosing reason reference; episodes are immutable once written and
 * stateVersion is the aggregate version after the transition. Profile
 * creation establishes ACTIVE directly and is not a transition episode.
 */
export interface CustomerStateTransitionProperties {
  readonly transitionId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly fromState: CustomerState;
  readonly toState: CustomerState;
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

export class CustomerStateTransition {
  public readonly properties: Readonly<CustomerStateTransitionProperties>;

  public constructor(properties: CustomerStateTransitionProperties) {
    if (properties.fromState === properties.toState) {
      throw new Error('Customer state transition must change state');
    }
    if (!Number.isSafeInteger(properties.stateVersion) || properties.stateVersion < 1) {
      throw new Error('Customer state version must be a positive safe integer');
    }
    if (properties.actorKind.trim().length === 0) {
      throw new Error('Customer transition requires the actor kind');
    }
    if (properties.reasonReference.trim().length === 0) {
      throw new Error('Customer transition requires a non-disclosing reason reference');
    }
    if (properties.createdAt < properties.transitionedAt) {
      throw new Error('Customer transition createdAt cannot precede transitionedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
