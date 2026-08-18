import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CustomerState } from '../value-objects/customer-state';

/**
 * WEMP-M06-SPEC-001 §4 (decision D-01). The Module 06-owned customer
 * aggregate root: lifecycle state, version, and timestamps. The only identity
 * linkage is the logical `identityId` reference to the Module 01 Identity —
 * no credentials, identifiers, sessions, or authentication material are ever
 * duplicated (A-04). One customer profile per identity in Phase 1 (unique
 * `identityId`, enforced at persistence — M06-M2). Addresses, the business
 * profile, preferences, transitions, and audit records are child records
 * referenced by `customerProfileId`.
 */
export interface CustomerProfileProperties {
  readonly customerProfileId: UuidV7;
  /** Logical reference to the Module 01 Identity; immutable after creation. */
  readonly identityId: UuidV7;
  readonly state: CustomerState;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly suspendedAt?: Date;
  readonly closedAt?: Date;
  readonly correlationId?: CorrelationIdentifier;
}

export class CustomerProfile {
  public readonly properties: Readonly<CustomerProfileProperties>;

  public constructor(properties: CustomerProfileProperties) {
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Customer profile updatedAt cannot precede createdAt');
    }
    if (properties.suspendedAt !== undefined && properties.suspendedAt < properties.createdAt) {
      throw new Error('Customer profile suspendedAt cannot precede createdAt');
    }
    if (properties.closedAt !== undefined && properties.closedAt < properties.createdAt) {
      throw new Error('Customer profile closedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
