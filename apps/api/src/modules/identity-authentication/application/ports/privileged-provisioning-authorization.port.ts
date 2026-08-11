import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';

/**
 * M01-ADM-001. The internal service authorization boundary for privileged
 * identity provisioning. The endpoint is INTERNAL_SERVICE and requires an
 * approved service authorization decision obtained through this narrow port at
 * decision time; Module 02 or the provisioning orchestrator storage is never
 * read directly. The port is intentionally narrow so the approved service
 * contract can be integrated later without touching the provisioning
 * milestone. No roles, permissions or authorization internals are ever copied.
 */
export interface PrivilegedProvisioningAuthorizationCommand {
  readonly provisioningReference: string;
  readonly actorIdentityId: UuidV7;
}

export interface PrivilegedProvisioningAuthorizationDecision {
  readonly authorized: boolean;
  /** Non-sensitive reference to the current service authorization decision. */
  readonly authorizationReference?: string;
}

export interface PrivilegedProvisioningAuthorizationPort {
  authorizeProvisioning(
    command: PrivilegedProvisioningAuthorizationCommand,
  ): Promise<PrivilegedProvisioningAuthorizationDecision>;
}
