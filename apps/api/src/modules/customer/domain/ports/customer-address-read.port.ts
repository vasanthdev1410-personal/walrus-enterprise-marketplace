import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CustomerAddressSnapshot } from '../value-objects/customer-address-snapshot';

/**
 * WEMP-M06-SPEC-001 §11 (decision D-13). Resolves a stable customer address
 * reference to an immutable snapshot for future M10 shipping consumption.
 * Unknown or REMOVED addresses resolve to deny (null) — never a snapshot.
 * Consuming modules (M10) never mutate the M06 address book. Port-only in
 * M06-M1; the shape becomes normative at Module 10 spec approval.
 */
export interface CustomerAddressReadPort {
  /**
   * Resolves an ACTIVE customer address to an immutable snapshot, or null
   * when the address is unknown or REMOVED (fail closed).
   */
  resolveAddressSnapshot(addressId: UuidV7): Promise<CustomerAddressSnapshot | null>;
}
