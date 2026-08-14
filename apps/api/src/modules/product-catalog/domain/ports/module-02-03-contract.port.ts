import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M04-SPEC-001 §4/§16 / WEMP-M04-CONTRACT-001 Part A (decisions D-01,
 * D-11). The Module 02/03 ↔ Module 04 seller/catalog contract. Module 04
 * never reads Module 01/02/03 storage and never evaluates roles itself:
 * seller eligibility and ownership scope are consumed through this port.
 * Every seller-scoped catalog operation resolves the caller's ACTIVE
 * association for the target seller and denies without it (fail closed).
 * No client-supplied ownership claims — scope is always resolved
 * server-side through the Module 02 ownership resolver.
 */
export interface SellerAssociationFacts {
  readonly identityId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly associationRole: 'OWNER' | 'MEMBER';
  readonly associationState: 'ACTIVE' | 'REMOVED';
}

export interface SellerEligibility {
  readonly identityId: UuidV7;
  readonly eligible: boolean;
  readonly sellerState?: string;
}

export interface Module02SellerAuthorizationContractPort {
  /**
   * Resolves the ACTIVE association of an identity for a seller, or null
   * when the identity has no association. Absence denies (fail closed).
   */
  resolveActiveAssociation(
    identityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<SellerAssociationFacts | null>;
  /**
   * WEMP-M04-SPEC-001 §2.2/§26. A verified, approved, and role-assigned
   * seller may list products (Module 03 §6). Fail closed: any error or
   * missing fact denies listing.
   */
  isSellerEligibleToList(identityId: UuidV7, sellerProfileId: UuidV7): Promise<SellerEligibility>;
}
