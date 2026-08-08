import type { CorrelationIdentifier } from '../../shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { IdentityState } from '../value-objects/identity-state';

export interface IdentityStateTransitionProperties {
  identityStateTransitionId: UuidV7;
  identityId: UuidV7;
  fromState?: IdentityState;
  toState: IdentityState;
  stateVersion: number;
  transitionedAt: Date;
  createdAt: Date;
  reasonCode?: string;
  correlationId?: CorrelationIdentifier;
  causationId?: UuidV7;
  sourceReference?: string;
}

export class IdentityStateTransition {
  public readonly properties: Readonly<IdentityStateTransitionProperties>;

  public constructor(properties: IdentityStateTransitionProperties) {
    if (properties.fromState !== undefined && properties.fromState === properties.toState) {
      throw new Error('Identity state transition must change state');
    }
    if (!Number.isSafeInteger(properties.stateVersion) || properties.stateVersion < 1) {
      throw new Error('Identity state version must be positive');
    }
    const isInitial = properties.stateVersion === 1;
    if (
      isInitial &&
      (properties.fromState !== undefined || properties.toState !== 'PENDING_VERIFICATION')
    ) {
      throw new Error(
        'Initial Identity transition must establish PENDING_VERIFICATION without fromState',
      );
    }
    if (!isInitial && properties.fromState === undefined) {
      throw new Error('Non-initial Identity transition requires fromState');
    }
    if (properties.createdAt < properties.transitionedAt) {
      throw new Error('Identity transition createdAt cannot precede transitionedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
