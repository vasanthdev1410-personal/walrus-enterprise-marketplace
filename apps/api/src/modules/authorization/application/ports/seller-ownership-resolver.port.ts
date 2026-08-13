import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-AUTHZ-001 §4 / WEMP-M03-CONTRACT-001 §B.3 (approved D-11). The
 * first resource-ownership resolver contract. Module 02 evaluates; Module 03
 * owns the association facts and implements this port over its own storage.
 * Module 02 never reads Module 03 storage directly and never trusts a
 * client-provided ownership claim: the seller profile identifier is resolved
 * against the authoritative SellerIdentityAssociation store and the returned
 * scope facts are the only basis for an organization-scoped decision.
 *
 * Fail closed: any resolution error (missing association, missing seller,
 * storage failure) must surface as a denial, never as a grant.
 */
export type BoundarySellerState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CORRECTIONS_REQUESTED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'CLOSED';

export type BoundarySellerAssociationRole = 'OWNER' | 'MEMBER';
export type BoundarySellerAssociationState = 'ACTIVE' | 'REMOVED';

export interface SellerScopeResolution {
  readonly sellerProfileId: UuidV7;
  readonly organizationId: UuidV7;
  readonly sellerState: BoundarySellerState;
  readonly associationRole: BoundarySellerAssociationRole;
  readonly associationState: BoundarySellerAssociationState;
}

export interface SellerOwnershipResolverPort {
  /**
   * Resolves the seller scope for an identity against the target seller
   * profile, or null when the identity has no association to that seller or
   * the seller does not exist. Implementations must fail closed (resolve to
   * null, never throw into a grant path).
   */
  resolveSellerScope(
    identityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<SellerScopeResolution | null>;
}
