import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerState } from '../value-objects/seller-state';

/**
 * WEMP-M03-SPEC-001 §4. Append-only lifecycle episode log. Every transition
 * requires an authenticated actor and a mandatory audit record; transitions
 * are immutable once written. Initial transition (stateVersion 1) establishes
 * DRAFT without a fromState; every later transition names its fromState.
 */
export interface SellerStateTransitionProperties {
  readonly sellerStateTransitionId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly fromState?: SellerState;
  readonly toState: SellerState;
  readonly stateVersion: number;
  readonly actorIdentityId: UuidV7;
  readonly actorKind: string;
  readonly transitionedAt: Date;
  readonly createdAt: Date;
  readonly reasonReference?: string;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
}

export class SellerStateTransition {
  public readonly properties: Readonly<SellerStateTransitionProperties>;

  public constructor(properties: SellerStateTransitionProperties) {
    if (properties.fromState !== undefined && properties.fromState === properties.toState) {
      throw new Error('Seller state transition must change state');
    }
    if (!Number.isSafeInteger(properties.stateVersion) || properties.stateVersion < 1) {
      throw new Error('Seller state version must be a positive safe integer');
    }
    const isInitial = properties.stateVersion === 1;
    if (isInitial && (properties.fromState !== undefined || properties.toState !== 'DRAFT')) {
      throw new Error('Initial Seller transition must establish DRAFT without fromState');
    }
    if (!isInitial && properties.fromState === undefined) {
      throw new Error('Non-initial Seller transition requires fromState');
    }
    if (properties.actorKind.trim().length === 0) {
      throw new Error('Seller transition requires the actor kind');
    }
    if (properties.createdAt < properties.transitionedAt) {
      throw new Error('Seller transition createdAt cannot precede transitionedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
