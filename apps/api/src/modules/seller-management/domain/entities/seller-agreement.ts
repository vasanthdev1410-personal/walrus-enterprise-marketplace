import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerAgreementType } from '../value-objects/seller-agreement-type';

/**
 * WEMP-M03-SPEC-001 §3 / decision D-05. Agreement record (record scope only).
 * Rate/terms business configuration is an owner (Finance) decision for
 * M03-M6 and is not modeled. signedAt records the signed-evidence reference
 * timestamp; the signed artifact is stored as an evidence reference.
 */
export interface SellerAgreementProperties {
  readonly agreementId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly agreementType: SellerAgreementType;
  readonly reference: string;
  readonly state: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date;
  readonly signedAt?: Date;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class SellerAgreement {
  public readonly properties: Readonly<SellerAgreementProperties>;

  public constructor(properties: SellerAgreementProperties) {
    if (properties.reference.trim().length === 0) {
      throw new Error('Agreement reference is required');
    }
    if (properties.effectiveTo !== undefined && properties.effectiveTo <= properties.effectiveFrom) {
      throw new Error('Agreement effectiveTo must be after effectiveFrom');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Agreement updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
