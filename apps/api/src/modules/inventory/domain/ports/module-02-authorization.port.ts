import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M05-AUTHZ-001 (decision D-05/A-09, Module 02 owner sign-off
 * RECORDED 2026-08-15). The Module 02 ↔ Module 05 authorization
 * boundary for the inventory resource scope (third ownership-resolver
 * scope). Module 05 never evaluates roles itself and never reads Module
 * 02 storage (A-02): every inventory operation resolves the caller's
 * ACTIVE association for the owning seller through this port and denies
 * without it (fail closed). No client-supplied ownership claims — scope
 * is always resolved server-side through the Module 02 ownership
 * resolver.
 *
 * The concrete wiring to the Module 02 resolver is M05-M4 work; M05-M1
 * defines only the shape Module 05 requires. Seller adjustments resolve
 * to the OWNER association (MEMBER read-only — Module 04 D-01 pattern).
 */
export interface InventorySellerAssociationFacts {
  readonly identityId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly associationRole: 'OWNER' | 'MEMBER';
  readonly associationState: 'ACTIVE' | 'REMOVED';
}

export interface Module02InventoryAuthorizationContractPort {
  /**
   * Resolves the ACTIVE association of an identity for a seller, or null
   * when the identity has no association. Absence denies (fail closed).
   */
  resolveActiveAssociation(
    identityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<InventorySellerAssociationFacts | null>;
}
