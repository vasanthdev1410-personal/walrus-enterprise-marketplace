import type { SellerIdentityAssociation } from '../entities/seller-identity-association';
import { SellerDomainError } from '../errors/seller-domain.error';

/**
 * WEMP-M03-CONTRACT-001 §A.2. Aggregate-level membership invariants. A seller
 * profile has exactly one OWNER (which is the primary association); an
 * identity is associated at most once per seller profile; a seller profile
 * cannot exist without an OWNER association (fail closed at creation).
 */
export class SellerAssociationPolicy {
  /**
   * Validates the full association set of a seller profile. Throws
   * SellerDomainError on any violation; returns the OWNER association on
   * success (callers require an owner for every seller operation).
   */
  public assertValidAssociations(
    associations: readonly SellerIdentityAssociation[],
  ): SellerIdentityAssociation {
    const active = associations.filter(
      (association) => association.properties.state === 'ACTIVE',
    );
    const owners = active.filter(
      (association) => association.properties.associationRole === 'OWNER',
    );
    const primary = active.filter((association) => association.properties.isPrimary);
    if (owners.length !== 1 || primary.length !== 1) {
      throw new SellerDomainError('SELLER_OWNER_CONFLICT');
    }
    const owner = owners[0];
    const primaryOwner = primary[0];
    if (owner === undefined || primaryOwner === undefined) {
      throw new SellerDomainError('SELLER_OWNER_CONFLICT');
    }
    if (owner.properties.associationId.value !== primaryOwner.properties.associationId.value) {
      throw new SellerDomainError('SELLER_OWNER_CONFLICT');
    }
    const identityIds = new Set(active.map((association) => association.properties.identityId.value));
    if (identityIds.size !== active.length) {
      throw new SellerDomainError('SELLER_ASSOCIATION_CONFLICT');
    }
    return owner;
  }

  /**
   * Resolves the ACTIVE association of an identity for a seller profile, or
   * null when the identity is not a member. Fail closed: no active
   * association means no seller-scoped operation.
   */
  public findActiveAssociation(
    associations: readonly SellerIdentityAssociation[],
    identityId: string,
  ): SellerIdentityAssociation | null {
    const match = associations.find(
      (association) =>
        association.properties.state === 'ACTIVE' &&
        association.properties.identityId.value === identityId,
    );
    return match ?? null;
  }
}
