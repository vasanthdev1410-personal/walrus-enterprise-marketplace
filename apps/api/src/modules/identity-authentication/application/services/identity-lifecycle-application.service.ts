import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { Identity } from '../../domain/identity/entities/identity';
import { IdentityStateTransition } from '../../domain/identity/entities/identity-state-transition';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import type { IdentityState } from '../../domain/identity/value-objects/identity-state';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { IdentityLifecycleError } from '../errors/identity-lifecycle.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { IdentityStateChangeAuthorizationPort } from '../ports/identity-state-change-authorization.port';

export interface ReadAuthenticationStateCommand {
  readonly identityId: UuidV7;
}

export interface AuthenticationStateResult {
  readonly identityId: string;
  readonly identityState: IdentityState;
  readonly verificationState: string;
  readonly authenticationSecurityClassification: string;
  readonly mfaState: string;
  readonly deletionState: string;
  readonly version: number;
}

export interface ChangeIdentityStateCommand {
  /** The ordinary Session-bound identity performing the cross-module call. */
  readonly actorIdentityId: UuidV7;
  readonly targetIdentityId: UuidV7;
  readonly targetIdentityState: IdentityState;
  readonly reasonCode: string;
  readonly sourceContractReference: string;
  readonly expectedIdentityVersion: number;
}

export interface IdentityStateChangeResult {
  readonly identityId: string;
  readonly identityState: IdentityState;
  readonly version: number;
}

/**
 * Approved Part 1 identity state machine (basic + administrative rows).
 * DELETED is deliberately absent: deletion behaviour is finalized with
 * privacy and retention requirements before production use and is gated
 * behind the Proposed privacy-request ADRs (M01-ID-002/003/005), so it can
 * never be requested through this contract.
 */
const APPROVED_TRANSITIONS: Readonly<Record<IdentityState, readonly IdentityState[]>> = {
  PENDING_VERIFICATION: ['ACTIVE'],
  ACTIVE: ['LOCKED', 'SUSPENDED', 'DISABLED'],
  LOCKED: ['ACTIVE'],
  SUSPENDED: ['ACTIVE'],
  DISABLED: ['ACTIVE'],
  DELETED: [],
};

/** Target states that prevent authentication and therefore require the
 * affected ordinary Sessions to be revoked (approved security workflow). */
const SESSION_PREVENTING_STATES: ReadonlySet<IdentityState> = new Set([
  'LOCKED',
  'SUSPENDED',
  'DISABLED',
]);

/**
 * M01-ID-001 to M01-ID-004 (approved subset). Authentication-state visibility
 * and Module 02-authorized identity state transitions.
 *
 * M01-ID-001 is a plain authenticated read of the identity's authentication
 * state: only identity lifecycle fields are exposed, never profile, role or
 * permission data. M01-ID-004 is MODULE_02_AUTHORIZED: a current Module 02
 * authorization decision is obtained through the narrow
 * IdentityStateChangeAuthorizationPort at decision time, Module 02 storage is
 * never read, and an ordinary Session alone can never authorize a state
 * change. Transitions are validated against the approved Part 1 state machine
 * (DELETED is privacy-gated and unreachable here), the identity version
 * precondition guards the write, the transition is recorded through the
 * version-guarded Identity aggregate write, and any target state that prevents
 * authentication revokes the identity's ordinary Sessions. No authorization
 * internals and no private identity data are ever exposed.
 */
export class IdentityLifecycleApplicationService {
  public constructor(
    private readonly identities: IdentityRepository,
    private readonly sessions: SessionRepository,
    private readonly stateChangeAuthorization: IdentityStateChangeAuthorizationPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
  ) {}

  /**
   * M01-ID-001. Reads the identity's authentication state. Only approved
   * lifecycle fields are returned; the classification reflects the current
   * EFFECTIVE assignment (defaulting to STANDARD_AUTHENTICATION), the MFA
   * state is the safe enrollment summary used across the module, and the
   * deletion state is NONE until a privacy request exists (Phase 1 has no
   * privacy-request records; the approved deletion flow is gated).
   */
  public async readAuthenticationState(
    command: ReadAuthenticationStateCommand,
  ): Promise<AuthenticationStateResult> {
    const snapshot = await this.identities.findAuthenticationById(command.identityId);
    if (snapshot === null) {
      throw new IdentityLifecycleError('RESOURCE_NOT_AVAILABLE');
    }
    const identity = snapshot.identity.properties;
    const classification = snapshot.classificationAssignments.find(
      (assignment) => assignment.properties.assignmentState === 'EFFECTIVE',
    );
    return {
      identityId: identity.identityId.value,
      identityState: identity.identityState,
      verificationState: identity.verificationState,
      authenticationSecurityClassification:
        classification?.properties.classification ?? 'STANDARD_AUTHENTICATION',
      mfaState: deriveMfaState(snapshot),
      deletionState: identity.deletionRequestedAt === undefined ? 'NONE' : 'REQUESTED',
      version: identity.aggregateVersion.value,
    };
  }

  /**
   * M01-ID-004. Authorizes and commits an identity authentication-state
   * transition. Authorization is obtained from the Module 02 boundary port
   * first (AUTHORIZATION_DENIED otherwise), the target must be reachable from
   * the current state on the approved Part 1 state machine, the If-Match
   * version precondition and the version-guarded aggregate write reject stale
   * writes, and target states that prevent authentication revoke the
   * identity's ordinary Sessions.
   */
  public async changeIdentityState(
    command: ChangeIdentityStateCommand,
  ): Promise<IdentityStateChangeResult> {
    const snapshot = await this.identities.findAuthenticationById(command.targetIdentityId);
    if (snapshot === null) {
      throw new IdentityLifecycleError('RESOURCE_NOT_AVAILABLE');
    }
    const identity = snapshot.identity.properties;
    if (identity.aggregateVersion.value !== command.expectedIdentityVersion) {
      throw new IdentityLifecycleError('RESOURCE_STATE_CONFLICT');
    }

    const authorization = await this.stateChangeAuthorization.authorizeStateChange({
      actorIdentityId: command.actorIdentityId,
      targetIdentityId: command.targetIdentityId,
      targetIdentityState: command.targetIdentityState,
      sourceContractReference: command.sourceContractReference,
    });
    if (!authorization.authorized) {
      throw new IdentityLifecycleError('AUTHORIZATION_DENIED');
    }

    const currentState = identity.identityState;
    if (currentState === command.targetIdentityState) {
      throw new IdentityLifecycleError('INVALID_IDENTITY_STATE_TRANSITION');
    }
    if (!APPROVED_TRANSITIONS[currentState].includes(command.targetIdentityState)) {
      throw new IdentityLifecycleError('INVALID_IDENTITY_STATE_TRANSITION');
    }

    const codeSets = await this.identities.findRecoveryCodeSets(command.targetIdentityId);
    const now = this.clock.now();
    const currentVersion = identity.aggregateVersion.value;
    const updatedVersion = new AggregateVersion(currentVersion + 1);
    // The disabledAt marker is (re)set only when entering DISABLED and is
    // cleared on every other transition so re-enabled identities never carry
    // a stale disabled marker (no silent resurrection).
    const { disabledAt: _carriedDisabledAt, ...identityRest } = identity;
    void _carriedDisabledAt;
    const updatedIdentity = new Identity({
      ...identityRest,
      identityState: command.targetIdentityState,
      ...(command.targetIdentityState === 'DISABLED' ? { disabledAt: now } : {}),
      aggregateVersion: updatedVersion,
      updatedAt: now,
    });

    const transition = new IdentityStateTransition({
      identityStateTransitionId: this.identifiers.next(),
      identityId: command.targetIdentityId,
      fromState: currentState,
      toState: command.targetIdentityState,
      stateVersion: currentVersion + 1,
      transitionedAt: now,
      createdAt: now,
      reasonCode: command.reasonCode,
      sourceReference: command.sourceContractReference,
    });

    try {
      await this.identities.save(
        {
          identity: updatedIdentity,
          identifiers: snapshot.identifiers,
          credentials: snapshot.credentials,
          classificationAssignments: snapshot.classificationAssignments,
          mfaEnrollments: snapshot.mfaEnrollments,
          mfaFactors: snapshot.mfaFactors,
          recoveryCodeSets: codeSets?.recoveryCodeSets ?? [],
          recoveryCodes: codeSets?.recoveryCodes ?? [],
          trustedDevices: snapshot.trustedDevices ?? [],
          credentialHistoryToAppend: [],
          passwordHistoryToAppend: [],
          stateTransitionsToAppend: [transition],
        },
        identity.aggregateVersion,
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new IdentityLifecycleError('RESOURCE_STATE_CONFLICT');
      }
      throw error;
    }

    if (SESSION_PREVENTING_STATES.has(command.targetIdentityState)) {
      await this.sessions.revokeAllSessionsForRecovery({
        identityId: command.targetIdentityId,
        revokedAt: now,
        revocationReason: `IDENTITY_${command.targetIdentityState}`,
      });
    }

    return {
      identityId: command.targetIdentityId.value,
      identityState: command.targetIdentityState,
      version: updatedVersion.value,
    };
  }
}

/**
 * Safe MFA state summary shared with the module's status reads. The
 * enrollment priority mirrors M01-MFA-003; no MFA secret, digest or setup
 * material is ever derived or exposed.
 */
function deriveMfaState(snapshot: {
  readonly mfaEnrollments: readonly { readonly properties: { readonly enrollmentState: string } }[];
}): string {
  const priority = ['ACTIVE', 'PENDING_VERIFICATION', 'REPLACEMENT_REQUIRED', 'DISABLED'] as const;
  for (const state of priority) {
    if (snapshot.mfaEnrollments.some((e) => e.properties.enrollmentState === state)) {
      return state;
    }
  }
  return 'NOT_ENROLLED';
}
