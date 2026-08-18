import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M06-SPEC-001 §11 (decision D-13). Minimal, fail-closed customer facts
 * for future M07 (cart) and M08 (orders) consumption. Only profiles that are
 * ACTIVE resolve to facts; unknown, SUSPENDED, or CLOSED profiles resolve to
 * deny (null) — consuming modules treat null as an authorization failure.
 * Port-only in M06-M1; the shape becomes normative at each consuming
 * module's spec approval.
 */
export interface CustomerProfileReadResult {
  readonly customerProfileId: UuidV7;
  readonly identityId: UuidV7;
}

export interface CustomerProfileReadPort {
  /**
   * Resolves an ACTIVE customer profile by its stable customerProfileId, or
   * null when the profile is unknown, SUSPENDED, or CLOSED (fail closed).
   */
  resolveActiveCustomer(customerProfileId: UuidV7): Promise<CustomerProfileReadResult | null>;
}
