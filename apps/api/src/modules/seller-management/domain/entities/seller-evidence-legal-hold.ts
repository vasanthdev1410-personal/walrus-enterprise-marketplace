import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-SPEC-001 / decision D-03. An authorized legal hold that prevents
 * automatic retention processing (expiry/deletion) of a seller's verification
 * evidence while it is active. Placed by an authorized admin identity with a
 * reason reference; release records who released and when. Fail closed: while
 * an active hold exists the retention processor must not delete evidence.
 */
export interface SellerEvidenceLegalHoldProperties {
  readonly legalHoldId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly authorizedByIdentityId: UuidV7;
  readonly reasonReference: string;
  readonly active: boolean;
  readonly placedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly releasedByIdentityId?: UuidV7;
  readonly releasedAt?: Date;
}

export class SellerEvidenceLegalHold {
  public readonly properties: Readonly<SellerEvidenceLegalHoldProperties>;

  public constructor(properties: SellerEvidenceLegalHoldProperties) {
    if (properties.reasonReference.trim().length === 0) {
      throw new Error('Legal hold requires a reason reference');
    }
    if (properties.active && properties.releasedAt !== undefined) {
      throw new Error('Active legal hold cannot have a release timestamp');
    }
    if (!properties.active) {
      if (properties.releasedAt === undefined || properties.releasedByIdentityId === undefined) {
        throw new Error('Released legal hold requires release actor and timestamp');
      }
    }
    if (properties.releasedAt !== undefined && properties.releasedAt < properties.placedAt) {
      throw new Error('Legal hold release cannot precede placement');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Legal hold updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
