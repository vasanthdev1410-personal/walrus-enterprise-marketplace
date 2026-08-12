import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import type { VerifiedWorkloadContextV2 } from './verified-workload-context';

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
  readonly actorIdentityId?: UuidV7;
  readonly workload?: VerifiedWorkloadContextV2;
  readonly provisioningAssertionDigest?: string;
}

export interface PrivilegedProvisioningAuthorizationDecision {
  readonly authorized: boolean;
  /** Non-sensitive reference to the current service authorization decision. */
  readonly authorizationReference?: string;
  readonly intendedIdentityId?: UuidV7;
  readonly operationId?: string;
  readonly authorityExpiresAt?: Date;
}

export interface PrivilegedProvisioningAuthorizationPort {
  authorizeProvisioning(
    command: PrivilegedProvisioningAuthorizationCommand,
  ): Promise<PrivilegedProvisioningAuthorizationDecision>;
  completeProvisioning?(command: {
    readonly operationId: string;
    readonly identityId: UuidV7;
    readonly authorizationReference: string;
  }): Promise<void>;
  markProvisioningFailure?(command: {
    readonly operationId: string;
    readonly reasonCode: string;
  }): Promise<void>;
}
