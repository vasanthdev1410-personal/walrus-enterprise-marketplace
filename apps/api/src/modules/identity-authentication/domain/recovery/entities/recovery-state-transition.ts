import type { CorrelationIdentifier } from '../../shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { RecoveryState } from '../value-objects/recovery-state';

export interface RecoveryStateTransitionProperties {
  recoveryStateTransitionId: UuidV7;
  recoveryRequestId: UuidV7;
  fromState: RecoveryState;
  toState: RecoveryState;
  stateVersion: number;
  transitionedAt: Date;
  createdAt: Date;
  actorIdentityId?: UuidV7;
  reasonCode?: string;
  correlationId?: CorrelationIdentifier;
}

export class RecoveryStateTransition {
  public readonly properties: Readonly<RecoveryStateTransitionProperties>;

  public constructor(properties: RecoveryStateTransitionProperties) {
    if (properties.fromState === properties.toState) {
      throw new Error('Recovery state transition must change state');
    }
    if (!Number.isSafeInteger(properties.stateVersion) || properties.stateVersion < 1) {
      throw new Error('Recovery state version must be positive');
    }
    if (properties.createdAt < properties.transitionedAt) {
      throw new Error('Recovery transition createdAt cannot precede transitionedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
