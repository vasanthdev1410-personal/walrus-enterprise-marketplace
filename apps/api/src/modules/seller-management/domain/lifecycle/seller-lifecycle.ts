import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { SellerProfile } from '../entities/seller-profile';
import { SellerStateTransition } from '../entities/seller-state-transition';
import { SellerDomainError } from '../errors/seller-domain.error';
import { isTerminalSellerState, type SellerState } from '../value-objects/seller-state';

/**
 * WEMP-M03-SPEC-001 §4 (decision D-07). The pure, deterministic seller
 * lifecycle state machine. Deny by default and fail closed: any unknown,
 * missing, terminal, same-state, actor-forbidden, reason-less, precondition-
 * failed, or separation-of-duties-violating transition is rejected with a
 * typed SellerDomainError. Every accepted transition yields an append-only
 * SellerStateTransition episode; the caller persists it atomically with the
 * version-guarded profile update.
 *
 * Actor model:
 *  - SELLER_OWNER: the OWNER association of the seller (SELLER role)
 *  - SELLER_MEMBER: a non-owner member (SELLER role; no lifecycle authority)
 *  - ADMIN_REVIEWER: admin assigned to review (seller.review.decide)
 *  - ADMIN_APPROVER: admin deciding approval/rejection (seller.review.decide),
 *    subject to reviewer ≠ approver separation of duties
 *  - ADMIN: admin with seller.suspend.manage / administrative closure
 *  - SYSTEM: automatic activation after the approved Module 02 role assignment
 */
export type SellerActorKind =
  | 'SELLER_OWNER'
  | 'SELLER_MEMBER'
  | 'ADMIN_REVIEWER'
  | 'ADMIN_APPROVER'
  | 'ADMIN'
  | 'SYSTEM';

export interface SellerActor {
  readonly identityId: UuidV7;
  readonly kind: SellerActorKind;
}

export interface SellerTransitionCommand {
  readonly sellerProfile: SellerProfile;
  readonly toState: SellerState;
  readonly actor: SellerActor;
  readonly now: Date;
  /** Caller-generated UUIDv7 for the append-only transition episode. */
  readonly transitionId: UuidV7;
  readonly reasonReference?: string;
  /** SoD: the identity that moved the seller into UNDER_REVIEW. Required for transitions out of UNDER_REVIEW. */
  readonly reviewerIdentityId?: UuidV7;
  /** DRAFT → SUBMITTED precondition (SellerCompliancePolicy.isOnboardingComplete). */
  readonly onboardingComplete?: boolean;
  /** UNDER_REVIEW → APPROVED precondition (SellerCompliancePolicy.areMandatoryVerificationsApproved). */
  readonly mandatoryVerificationsApproved?: boolean;
  /** APPROVED → ACTIVE precondition: SELLER role granted via Module 02 contract. */
  readonly roleAssignmentGranted?: boolean;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly sourceReference?: string;
}

interface TransitionRule {
  readonly actors: readonly SellerActorKind[];
  readonly reasonRequired: boolean;
}

/**
 * The complete transition table from WEMP-M03-SPEC-001 §4. Same-state
 * transitions, terminal states, and any (from, to) pair absent from this map
 * are forbidden (fail closed).
 */
const TRANSITION_TABLE: Readonly<
  Partial<Record<SellerState, Readonly<Partial<Record<SellerState, TransitionRule>>>>>
> = {
    DRAFT: {
      SUBMITTED: { actors: ['SELLER_OWNER'], reasonRequired: false },
    },
    SUBMITTED: {
      UNDER_REVIEW: { actors: ['ADMIN_REVIEWER'], reasonRequired: false },
      REJECTED: { actors: ['ADMIN_APPROVER'], reasonRequired: true },
    },
    UNDER_REVIEW: {
      CORRECTIONS_REQUESTED: { actors: ['ADMIN_REVIEWER'], reasonRequired: true },
      APPROVED: { actors: ['ADMIN_APPROVER'], reasonRequired: false },
      REJECTED: { actors: ['ADMIN_APPROVER'], reasonRequired: true },
    },
    CORRECTIONS_REQUESTED: {
      SUBMITTED: { actors: ['SELLER_OWNER'], reasonRequired: false },
      REJECTED: { actors: ['ADMIN_APPROVER'], reasonRequired: true },
    },
    APPROVED: {
      ACTIVE: { actors: ['SYSTEM'], reasonRequired: false },
      CLOSED: { actors: ['SELLER_OWNER', 'ADMIN'], reasonRequired: true },
    },
    ACTIVE: {
      SUSPENDED: { actors: ['ADMIN'], reasonRequired: true },
      CLOSED: { actors: ['SELLER_OWNER', 'ADMIN'], reasonRequired: true },
    },
    SUSPENDED: {
      ACTIVE: { actors: ['ADMIN'], reasonRequired: false },
      CLOSED: { actors: ['SELLER_OWNER', 'ADMIN'], reasonRequired: true },
    },
    REJECTED: {},
    CLOSED: {},
  };

export class SellerLifecycle {
  /**
   * Validates the requested transition and returns the append-only
   * SellerStateTransition episode. Throws SellerDomainError on any violation
   * (fail closed); does not mutate the profile.
   */
  public transition(command: SellerTransitionCommand): SellerStateTransition {
    const { sellerProfile, toState, actor, now } = command;

    if (isTerminalSellerState(sellerProfile.properties.state)) {
      throw new SellerDomainError('SELLER_STATE_CONFLICT');
    }
    if (sellerProfile.properties.state === toState) {
      throw new SellerDomainError('SELLER_STATE_CONFLICT');
    }

    const rule = TRANSITION_TABLE[sellerProfile.properties.state]?.[toState];
    if (rule === undefined) {
      throw new SellerDomainError('SELLER_TRANSITION_FORBIDDEN');
    }
    if (!rule.actors.includes(actor.kind)) {
      throw new SellerDomainError('SELLER_TRANSITION_FORBIDDEN');
    }
    if (rule.reasonRequired && (command.reasonReference === undefined || command.reasonReference.trim().length === 0)) {
      throw new SellerDomainError('SELLER_REASON_REQUIRED');
    }

    if (sellerProfile.properties.state === 'DRAFT' && toState === 'SUBMITTED') {
      if (command.onboardingComplete !== true) {
        throw new SellerDomainError('SELLER_PRECONDITION_FAILED');
      }
    }
    if (sellerProfile.properties.state === 'UNDER_REVIEW' && toState === 'APPROVED') {
      if (command.mandatoryVerificationsApproved !== true) {
        throw new SellerDomainError('SELLER_PRECONDITION_FAILED');
      }
      this.assertSeparationOfDuties(command);
    }
    if (sellerProfile.properties.state === 'UNDER_REVIEW' && toState === 'REJECTED') {
      this.assertSeparationOfDuties(command);
    }
    if (sellerProfile.properties.state === 'APPROVED' && toState === 'ACTIVE') {
      if (command.roleAssignmentGranted !== true) {
        throw new SellerDomainError('SELLER_PRECONDITION_FAILED');
      }
    }

    return new SellerStateTransition({
      sellerStateTransitionId: command.transitionId,
      sellerProfileId: sellerProfile.properties.sellerProfileId,
      fromState: sellerProfile.properties.state,
      toState,
      stateVersion: sellerProfile.properties.aggregateVersion.value + 1,
      actorIdentityId: actor.identityId,
      actorKind: actor.kind,
      transitionedAt: now,
      createdAt: now,
      ...(command.reasonReference !== undefined ? { reasonReference: command.reasonReference } : {}),
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
      ...(command.causationId !== undefined ? { causationId: command.causationId } : {}),
      ...(command.sourceReference !== undefined ? { sourceReference: command.sourceReference } : {}),
    });
  }

  /**
   * Returns true when the transition is permitted under the command; never
   * throws. Used for decision checks and tests.
   */
  public canTransition(command: SellerTransitionCommand): boolean {
    try {
      this.transition(command);
      return true;
    } catch (error) {
      if (error instanceof SellerDomainError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Returns the version-guarded profile in the new state. State-specific
   * timestamps are maintained (submittedAt, approvedAt, suspendedAt,
   * closedAt); updatedAt and aggregateVersion are always advanced.
   */
  public updatedProfile(sellerProfile: SellerProfile, toState: SellerState, now: Date): SellerProfile {
    const properties = sellerProfile.properties;
    return new SellerProfile({
      ...properties,
      state: toState,
      ...(toState === 'SUBMITTED' ? { submittedAt: now } : {}),
      ...(toState === 'APPROVED' ? { approvedAt: now } : {}),
      ...(toState === 'SUSPENDED' ? { suspendedAt: now } : {}),
      ...(toState === 'CLOSED' ? { closedAt: now } : {}),
      updatedAt: now,
      aggregateVersion: new AggregateVersion(properties.aggregateVersion.value + 1),
    });
  }

  /**
   * WEMP-M03-SPEC-001 §4. Profile (business information) updates are permitted
   * in DRAFT, CORRECTIONS_REQUESTED, ACTIVE and SUSPENDED; denied while the
   * seller is locked for review or terminal (fail closed). Updates never
   * change lifecycle state and never create a state-transition episode.
   */
  public assertCanUpdate(state: SellerState): void {
    const updatable: readonly SellerState[] = [
      'DRAFT',
      'CORRECTIONS_REQUESTED',
      'ACTIVE',
      'SUSPENDED',
    ];
    if (!updatable.includes(state)) {
      throw new SellerDomainError('SELLER_UPDATE_FORBIDDEN');
    }
  }

  /**
   * Separation of duties (WEMP-M03-SPEC-001 §12.8, decision D-08): the admin
   * who decides APPROVED/REJECTED out of UNDER_REVIEW must not be the
   * reviewer that placed the seller in UNDER_REVIEW. The reviewer identity is
   * resolved from the transition log by the application layer and supplied as
   * reviewerIdentityId; its absence fails closed for transitions out of
   * UNDER_REVIEW.
   */
  private assertSeparationOfDuties(command: SellerTransitionCommand): void {
    const reviewer = command.reviewerIdentityId;
    if (reviewer === undefined) {
      throw new SellerDomainError('SELLER_SOD_VIOLATION');
    }
    if (reviewer.value === command.actor.identityId.value) {
      throw new SellerDomainError('SELLER_SOD_VIOLATION');
    }
  }
}
