import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-CONTRACT-001 §A.6 / decision D-04. The Module 01 ↔ Module 03
 * identity contract. Module 03 never reads Module 01 storage; it consumes
 * verified identity facts through this port. Module 01's own state vocabulary
 * is intentionally not imported — the adapter maps it into this boundary type.
 */
export type BoundaryIdentityState =
  'PENDING_VERIFICATION' | 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'DISABLED' | 'DELETED';

export type BoundaryIdentityVerificationState = 'PENDING_VERIFICATION' | 'VERIFIED';

export interface IdentityEligibility {
  readonly identityId: UuidV7;
  readonly state: BoundaryIdentityState;
  readonly verificationState: BoundaryIdentityVerificationState;
}

export interface Module01IdentityContractPort {
  /**
   * Returns the authoritative identity/verification facts for an identity.
   * Fail closed: any error resolving the identity denies seller operations.
   */
  getIdentityEligibility(identityId: UuidV7): Promise<IdentityEligibility>;
}
