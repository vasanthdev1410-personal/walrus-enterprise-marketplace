import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { ProtectedValue } from '../../../identity-authentication/domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-SPEC-001 §3. The legal business entity that is the KYC/KYB subject
 * of a seller. Registration identifiers (GST/PAN — decision D-02) are held as
 * ProtectedValue; only the lookup digest is queryable. Business address is a
 * public legal-entity attribute, not protected PII.
 */
export interface SellerOrganizationProperties {
  readonly organizationId: UuidV7;
  readonly legalName: string;
  readonly tradeName: string;
  readonly businessType?: string;
  readonly registrationNumber: ProtectedValue;
  readonly registrationLookupDigest: string;
  readonly businessAddress: string;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class SellerOrganization {
  public readonly properties: Readonly<SellerOrganizationProperties>;

  public constructor(properties: SellerOrganizationProperties) {
    if (properties.legalName.trim().length === 0) {
      throw new Error('Seller organization legal name is required');
    }
    if (properties.tradeName.trim().length === 0) {
      throw new Error('Seller organization trade name is required');
    }
    if (!/^[0-9a-f]{64}$/i.test(properties.registrationLookupDigest)) {
      throw new Error('Seller organization registration lookup digest must be a SHA-256 hex digest');
    }
    if (properties.businessAddress.trim().length === 0) {
      throw new Error('Seller organization business address is required');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Seller organization updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
