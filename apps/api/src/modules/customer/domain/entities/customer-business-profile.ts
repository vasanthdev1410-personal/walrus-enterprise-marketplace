import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M06-SPEC-001 §8 (decision D-05). Optional B2B/company information
 * (0..1 per customer profile — cardinality enforced by
 * CustomerBusinessProfilePolicy at the aggregate level and by a unique
 * customerProfileId at persistence). The registration reference is stored as
 * a SHA-256 lookup digest and never as raw value in audit; the profile is
 * separate from authentication identity (no credentials) and separate from
 * the address book.
 */
export interface CustomerBusinessProfileProperties {
  readonly customerBusinessProfileId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly companyName: string;
  /** SHA-256 hex digest of the registration reference; never the raw value. */
  readonly registrationLookupDigest?: string;
  readonly businessType?: string;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class CustomerBusinessProfile {
  public readonly properties: Readonly<CustomerBusinessProfileProperties>;

  public constructor(properties: CustomerBusinessProfileProperties) {
    if (properties.companyName.trim().length === 0) {
      throw new Error('Customer business profile company name is required');
    }
    if (
      properties.registrationLookupDigest !== undefined &&
      !/^[0-9a-f]{64}$/i.test(properties.registrationLookupDigest)
    ) {
      throw new Error(
        'Customer business profile registration lookup digest must be a SHA-256 hex digest',
      );
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Customer business profile updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
