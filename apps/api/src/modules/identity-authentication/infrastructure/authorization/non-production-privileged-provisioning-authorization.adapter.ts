import { Injectable } from '@nestjs/common';
import type {
  PrivilegedProvisioningAuthorizationCommand,
  PrivilegedProvisioningAuthorizationDecision,
  PrivilegedProvisioningAuthorizationPort,
} from '../../application/ports/privileged-provisioning-authorization.port';

/**
 * Fail-closed internal-service authorization boundary for privileged identity
 * provisioning (M01-ADM-001). No approved service authorization decision is
 * integrated yet, so every request is denied with AUTHORIZATION_DENIED. The
 * full provisioning flow is exercised against a mocked valid authorization in
 * unit and integration tests; once the approved Module 02/coordination
 * contract lands, this adapter is replaced without touching the provisioning
 * milestone. An always-valid adapter is never acceptable: the caller's
 * ordinary Session alone must not provision a privileged Identity.
 */
@Injectable()
export class NonProductionPrivilegedProvisioningAuthorizationAdapter implements PrivilegedProvisioningAuthorizationPort {
  public authorizeProvisioning(
    command: PrivilegedProvisioningAuthorizationCommand,
  ): Promise<PrivilegedProvisioningAuthorizationDecision> {
    // No approved service authorization contract is integrated yet; the
    // command carries the provisioning context that the future approved
    // contract will evaluate. Every provisioning request is denied until then.
    void command;
    return Promise.resolve({ authorized: false });
  }
}
