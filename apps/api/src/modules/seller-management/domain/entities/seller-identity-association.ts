import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AssociationRole } from '../value-objects/association-role';

/**
 * WEMP-M03-CONTRACT-001 §A.2. Records an Identity ↔ Seller link. identityId is
 * a logical reference to a Module 01 Identity (UUIDv7) — never a foreign key
 * and never a duplicate Identity. Module 03 stores no authentication state.
 *
 * Invariants (enforced by SellerAssociationPolicy at the aggregate level):
 * exactly one OWNER per seller profile; OWNER implies isPrimary; an identity
 * may hold associations to multiple seller profiles.
 */
export interface SellerIdentityAssociationProperties {
  readonly associationId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly identityId: UuidV7;
  readonly associationRole: AssociationRole;
  readonly isPrimary: boolean;
  readonly state: 'ACTIVE' | 'REMOVED';
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly removedAt?: Date;
}

export class SellerIdentityAssociation {
  public readonly properties: Readonly<SellerIdentityAssociationProperties>;

  public constructor(properties: SellerIdentityAssociationProperties) {
    if (properties.associationRole === 'OWNER' && !properties.isPrimary) {
      throw new Error('Owner association must be the primary association');
    }
    if (properties.associationRole === 'MEMBER' && properties.isPrimary) {
      throw new Error('Member association cannot be the primary association');
    }
    if (properties.state === 'REMOVED' && properties.removedAt === undefined) {
      throw new Error('Removed association requires removedAt');
    }
    if (properties.removedAt !== undefined && properties.state !== 'REMOVED') {
      throw new Error('removedAt requires the REMOVED association state');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Association updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
