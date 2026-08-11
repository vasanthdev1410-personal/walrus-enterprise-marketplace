import type { IdentityState } from '../../domain/identity/value-objects/identity-state';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';

/**
 * M01-ID-004. The Module 02 authorization boundary for identity
 * authentication-state transitions. The state-transition endpoint is
 * MODULE_02_AUTHORIZED: a current Module 02 authorization decision is obtained
 * through this approved contract at decision time and Module 02 storage is
 * never read directly. The port is intentionally narrow so Module 02 can be
 * integrated later without touching the identity lifecycle milestone. No
 * authorization internals (roles, permissions, policies) are ever copied.
 */
export interface IdentityStateChangeAuthorizationCommand {
  /** The ordinary Session-bound identity performing the cross-module call. */
  readonly actorIdentityId: UuidV7;
  /** The identity whose authentication state would change. */
  readonly targetIdentityId: UuidV7;
  readonly targetIdentityState: IdentityState;
  /** Approved source contract reference that motivates the change. */
  readonly sourceContractReference: string;
}

export interface IdentityStateChangeAuthorizationDecision {
  readonly authorized: boolean;
  /** Non-sensitive reference to the current Module 02 authorization decision. */
  readonly authorizationReference?: string;
}

export interface IdentityStateChangeAuthorizationPort {
  authorizeStateChange(
    command: IdentityStateChangeAuthorizationCommand,
  ): Promise<IdentityStateChangeAuthorizationDecision>;
}
