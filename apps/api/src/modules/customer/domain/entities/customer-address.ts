import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CustomerAddressRole } from '../value-objects/customer-address-role';

/**
 * WEMP-M06-SPEC-001 §7 (decision D-04). A customer address book entry. An
 * address carries at least one role tag (SHIPPING, BILLING) and at most one
 * default flag per role at the aggregate level (enforced by
 * CustomerAddressPolicy). Soft removal (REMOVED) is auditable; a REMOVED
 * address can never be a default and can never return to ACTIVE silently —
 * re-activation requires an approved address-state operation. Records are
 * never hard-deleted (retention governs lifespan, A-15).
 */
export interface CustomerAddressProperties {
  readonly addressId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly region?: string;
  readonly postalCode: string;
  /** ISO 3166-1 alpha-2 country code. */
  readonly countryCode: string;
  readonly phone?: string;
  readonly roles: readonly CustomerAddressRole[];
  readonly isDefaultShipping: boolean;
  readonly isDefaultBilling: boolean;
  readonly state: 'ACTIVE' | 'REMOVED';
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly removedAt?: Date;
}

export class CustomerAddress {
  public readonly properties: Readonly<CustomerAddressProperties>;

  public constructor(properties: CustomerAddressProperties) {
    if (properties.recipientName.trim().length === 0) {
      throw new Error('Customer address recipient name is required');
    }
    if (properties.line1.trim().length === 0) {
      throw new Error('Customer address line1 is required');
    }
    if (properties.city.trim().length === 0) {
      throw new Error('Customer address city is required');
    }
    if (properties.postalCode.trim().length === 0) {
      throw new Error('Customer address postal code is required');
    }
    if (!/^[A-Z]{2}$/.test(properties.countryCode)) {
      throw new Error('Customer address country code must be an ISO 3166-1 alpha-2 code');
    }
    if (properties.roles.length === 0) {
      throw new Error('Customer address requires at least one role');
    }
    if (properties.isDefaultShipping && !properties.roles.includes('SHIPPING')) {
      throw new Error('Default shipping address requires the SHIPPING role');
    }
    if (properties.isDefaultBilling && !properties.roles.includes('BILLING')) {
      throw new Error('Default billing address requires the BILLING role');
    }
    if (
      properties.state === 'REMOVED' &&
      (properties.isDefaultShipping || properties.isDefaultBilling)
    ) {
      throw new Error('Removed address cannot be a default address');
    }
    if (properties.state === 'REMOVED' && properties.removedAt === undefined) {
      throw new Error('Removed address requires removedAt');
    }
    if (properties.removedAt !== undefined && properties.state !== 'REMOVED') {
      throw new Error('removedAt requires the REMOVED address state');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Customer address updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
