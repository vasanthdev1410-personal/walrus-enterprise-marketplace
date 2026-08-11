import type { AuthenticationSecurityClassification } from '../../domain/identity/value-objects/authentication-security-classification';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';

/**
 * M01-CLS-001. The approved internal coordination-contract boundary for
 * authentication-security classification transitions. The endpoint is
 * INTERNAL_SERVICE and requires an approved coordination contract: the
 * versioned source contract reference is validated through this port at
 * decision time and no cross-module storage is ever read directly. The port is
 * intentionally narrow so the approved contract can be integrated later
 * without touching the classification milestone. No authorization internals
 * (roles, permissions, policies) are ever copied.
 */
export interface ClassificationTransitionCoordinationCommand {
  /** The service identity performing the internal call. */
  readonly actorIdentityId: UuidV7;
  readonly targetIdentityId: UuidV7;
  readonly targetAuthenticationSecurityClassification: AuthenticationSecurityClassification;
  readonly sourceContractReference: string;
}

export interface ClassificationTransitionCoordinationDecision {
  readonly contractValid: boolean;
  /** Non-sensitive reference to the approved coordination contract. */
  readonly contractReference?: string;
}

export interface ClassificationTransitionCoordinationPort {
  validateContract(
    command: ClassificationTransitionCoordinationCommand,
  ): Promise<ClassificationTransitionCoordinationDecision>;
}
