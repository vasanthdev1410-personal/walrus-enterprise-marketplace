import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M06-SPEC-001 §11 (decision D-13). An immutable snapshot of a customer
 * address, resolved by CustomerAddressReadPort for future M10 shipping
 * consumption. The snapshot is captured at a point in time; consuming modules
 * never mutate the M06 address book. Unknown or REMOVED addresses resolve to
 * deny (fail closed) and never produce a snapshot.
 */
export interface CustomerAddressSnapshotProperties {
  readonly addressId: UuidV7;
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly region?: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly phone?: string;
  /** When the snapshot was captured (the address state it reflects). */
  readonly capturedAt: Date;
}

export class CustomerAddressSnapshot {
  public readonly properties: Readonly<CustomerAddressSnapshotProperties>;

  public constructor(properties: CustomerAddressSnapshotProperties) {
    if (properties.recipientName.trim().length === 0) {
      throw new Error('Address snapshot recipient name is required');
    }
    if (properties.line1.trim().length === 0) {
      throw new Error('Address snapshot line1 is required');
    }
    if (properties.city.trim().length === 0) {
      throw new Error('Address snapshot city is required');
    }
    if (properties.postalCode.trim().length === 0) {
      throw new Error('Address snapshot postal code is required');
    }
    if (!/^[A-Z]{2}$/.test(properties.countryCode)) {
      throw new Error('Address snapshot country code must be an ISO 3166-1 alpha-2 code');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
