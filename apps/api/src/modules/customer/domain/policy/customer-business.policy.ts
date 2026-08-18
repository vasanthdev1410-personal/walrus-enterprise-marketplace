import type { CustomerBusinessProfile } from '../entities/customer-business-profile';
import { CustomerDomainError } from '../errors/customer-domain.error';

/**
 * WEMP-M06-SPEC-001 §8 (decision D-05). Aggregate-level business-profile
 * cardinality: at most one CustomerBusinessProfile per customer profile
 * (0..1). Attaching a second business profile to a customer that already has
 * one fails closed with a non-disclosing CustomerDomainError. A business
 * profile is optional — an individual customer may have none.
 */
export class CustomerBusinessProfilePolicy {
  /**
   * Validates that a customer profile may attach a business profile. Throws
   * CustomerDomainError when the customer already has one; returns void when
   * the profile has none (0..1 cardinality satisfied).
   */
  public assertCanAttachBusinessProfile(existing: CustomerBusinessProfile | null): void {
    if (existing !== null) {
      throw new CustomerDomainError('CUSTOMER_BUSINESS_PROFILE_CONFLICT');
    }
  }
}
