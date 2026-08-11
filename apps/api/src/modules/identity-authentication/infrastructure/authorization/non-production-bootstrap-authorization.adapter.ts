import { Injectable } from '@nestjs/common';
import type {
  BootstrapAuthorizationCommand,
  BootstrapAuthorizationDecision,
  BootstrapAuthorizationPort,
} from '../../application/ports/bootstrap-authorization.port';

/**
 * Fail-closed controlled-bootstrap boundary for the initial Super Admin
 * Identity (M01-ADM-002). No approved controlled bootstrap contract is
 * integrated yet, so the route is always unavailable (BOOTSTRAP_UNAVAILABLE).
 * The full bootstrap flow is exercised against a mocked available bootstrap in
 * unit and integration tests; once the approved controlled deployment contract
 * lands, this adapter is replaced without touching the provisioning milestone.
 * An always-available adapter is never acceptable: the bootstrap route must
 * remain unavailable until a controlled deployment process is approved.
 */
@Injectable()
export class NonProductionBootstrapAuthorizationAdapter implements BootstrapAuthorizationPort {
  public authorizeBootstrap(
    command: BootstrapAuthorizationCommand,
  ): Promise<BootstrapAuthorizationDecision> {
    // No approved controlled bootstrap contract is integrated yet; the command
    // carries the evidence that the future approved contract will evaluate.
    // The route stays unavailable until then.
    void command;
    return Promise.resolve({ available: false });
  }
}
