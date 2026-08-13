import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { ComplianceState } from '../value-objects/compliance-state';
import type { SellerState } from '../value-objects/seller-state';

/**
 * WEMP-M03-SPEC-001 §3. The seller aggregate root: lifecycle state, compliance
 * state, and business status. complianceState is a derived summary (never a
 * writable input) computed by SellerCompliancePolicy at the application
 * boundary; the entity stores the latest derived value for persistence.
 * Organization, verifications, associations, warehouses, agreements and
 * transitions are child aggregates referenced by sellerProfileId.
 */
export interface SellerProfileProperties {
  readonly sellerProfileId: UuidV7;
  readonly organizationId: UuidV7;
  readonly state: SellerState;
  readonly complianceState: ComplianceState;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly submittedAt?: Date;
  readonly approvedAt?: Date;
  readonly suspendedAt?: Date;
  readonly closedAt?: Date;
  readonly correlationId?: CorrelationIdentifier;
}

export class SellerProfile {
  public readonly properties: Readonly<SellerProfileProperties>;

  public constructor(properties: SellerProfileProperties) {
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Seller profile updatedAt cannot precede createdAt');
    }
    if (properties.submittedAt !== undefined && properties.submittedAt < properties.createdAt) {
      throw new Error('Seller profile submittedAt cannot precede createdAt');
    }
    if (properties.approvedAt !== undefined && properties.approvedAt < properties.createdAt) {
      throw new Error('Seller profile approvedAt cannot precede createdAt');
    }
    if (properties.suspendedAt !== undefined && properties.suspendedAt < properties.createdAt) {
      throw new Error('Seller profile suspendedAt cannot precede createdAt');
    }
    if (properties.closedAt !== undefined && properties.closedAt < properties.createdAt) {
      throw new Error('Seller profile closedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
