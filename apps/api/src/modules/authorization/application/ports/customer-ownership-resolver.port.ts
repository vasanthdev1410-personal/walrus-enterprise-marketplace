import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M06-AUTHZ-001 §4 (decision D-07; Module 02 owner sign-off RECORDED
 * 2026-08-17). The fourth resource-ownership resolver contract — customer
 * identity scope. Module 02 evaluates; Module 06 owns the customer-profile
 * facts and implements this port over its own storage. Module 02 never reads
 * Module 06 storage directly and never trusts a client-provided ownership
 * claim: the customer profile identifier is resolved against the
 * authoritative CustomerProfile store (identityId match) and the returned
 * scope facts are the only basis for a customer-identity-scoped decision.
 *
 * Fail closed: any resolution error (missing profile, identity mismatch,
 * storage failure) must surface as a denial (null), never as a grant.
 */
export type BoundaryCustomerState = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export interface CustomerScopeResolution {
  readonly customerProfileId: UuidV7;
  /** The Module 01 identity that owns the customer profile. */
  readonly identityId: UuidV7;
  readonly customerState: BoundaryCustomerState;
}

export interface CustomerOwnershipResolverPort {
  /**
   * Resolves the customer scope for an identity against the target customer
   * profile, or null when the identity does not own that profile or the
   * profile does not exist. Implementations must fail closed (resolve to
   * null, never throw into a grant path).
   */
  resolveCustomerScope(
    identityId: UuidV7,
    customerProfileId: UuidV7,
  ): Promise<CustomerScopeResolution | null>;
}
