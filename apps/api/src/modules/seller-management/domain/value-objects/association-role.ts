/**
 * WEMP-M03-CONTRACT-001 §A.2 / decision D-01. Seller organization membership
 * uses a single SELLER role (Module 02) with an OWNER/MEMBER distinction
 * carried by the SellerIdentityAssociation. Exactly one OWNER association
 * exists per seller profile.
 */
export const ASSOCIATION_ROLES = ['OWNER', 'MEMBER'] as const;

export type AssociationRole = (typeof ASSOCIATION_ROLES)[number];
