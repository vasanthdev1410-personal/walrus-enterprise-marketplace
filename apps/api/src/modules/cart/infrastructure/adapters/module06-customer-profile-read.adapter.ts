import { Injectable } from '@nestjs/common';
import type { CustomerProfileRepository } from '../../../customer/domain/ports/customer-repository.port';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  CustomerProfileReadPort,
  CustomerProfileReadResult,
} from '../../../customer/domain/ports/customer-profile-read.port';

/**
 * WEMP-M07-AUTHZ-001 §4 (D-09, Module 02 owner sign-off RECORDED 2026-08-19;
 * M07-M4). Real Module 06 CustomerProfileReadPort adapter for Module 07.
 * Resolves the active customer profile through the authoritative Module 06
 * storage (CustomerProfileRepository.findByIdentityId). Only ACTIVE profiles
 * resolve to facts; unknown, SUSPENDED, or CLOSED profiles resolve to null
 * (fail closed). Module 07 never reads Module 06 storage directly (A-03/A-05);
 * this adapter is the approved port through which Module 07 consumes Module 06
 * customer facts.
 */
@Injectable()
export class Module06CustomerProfileReadAdapter implements CustomerProfileReadPort {
  public constructor(private readonly customerRepository: CustomerProfileRepository) {}

  public async resolveActiveCustomer(
    customerProfileId: UuidV7,
  ): Promise<CustomerProfileReadResult | null> {
    try {
      const profile = await this.customerRepository.findById(customerProfileId);
      if (profile === null) {
        return null;
      }
      // Only ACTIVE profiles resolve (fail closed for SUSPENDED/CLOSED).
      if (profile.properties.state !== 'ACTIVE') {
        return null;
      }
      return {
        customerProfileId: profile.properties.customerProfileId,
        identityId: profile.properties.identityId,
      };
    } catch {
      // Fail closed: any error resolves to null (deny).
      return null;
    }
  }
}
