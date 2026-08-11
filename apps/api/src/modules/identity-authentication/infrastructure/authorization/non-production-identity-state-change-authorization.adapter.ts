import { Injectable } from '@nestjs/common';
import type {
  IdentityStateChangeAuthorizationCommand,
  IdentityStateChangeAuthorizationDecision,
  IdentityStateChangeAuthorizationPort,
} from '../../application/ports/identity-state-change-authorization.port';

/**
 * Fail-closed Module 02 authorization boundary for identity state transitions
 * (M01-ID-004). Module 02 (roles, permissions, authorization decisions) is not
 * implemented yet, so no caller can currently obtain a current authorization
 * decision and every transition is denied with AUTHORIZATION_DENIED. The full
 * transition flow is exercised against a mocked authorized decision in unit and
 * integration tests; once Module 02 lands, this adapter is replaced by the
 * approved contract without touching the identity lifecycle milestone. An
 * always-permissive adapter is never acceptable: the caller's ordinary Session
 * alone must not authorize a privileged state change.
 */
@Injectable()
export class NonProductionIdentityStateChangeAuthorizationAdapter implements IdentityStateChangeAuthorizationPort {
  public authorizeStateChange(
    command: IdentityStateChangeAuthorizationCommand,
  ): Promise<IdentityStateChangeAuthorizationDecision> {
    // Module 02 cannot currently produce a decision; the command carries the
    // change context that the future approved contract will evaluate. Every
    // transition is denied until then.
    void command;
    return Promise.resolve({ authorized: false });
  }
}
