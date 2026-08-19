import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  CustomerProfileReadPort,
  CustomerProfileReadResult,
} from '../../../customer/domain/ports/customer-profile-read.port';

/**
 * WEMP-M07-SPEC-001 (decision D-02/A-10). Fail-closed customer profile
 * resolution adapter for M07-M3: no customer profile is ever resolved, so
 * every cart operation requiring customer identity verification is denied
 * until M07-M4 wires the real Module 06 CustomerProfileReadPort adapter.
 *
 * Module 07 never reads Module 06 storage (A-03/A-05); a missing wiring
 * must never surface as a valid customer — deny is the only safe default.
 *
 * M07-M4 will replace this with the real Module 06 adapter that reads
 * the PrismaCustomerProfileRepository through the approved port.
 */
@Injectable()
export class FailClosedCustomerProfileReadAdapter implements CustomerProfileReadPort {
  public resolveActiveCustomer(
    customerProfileId: UuidV7,
  ): Promise<CustomerProfileReadResult | null> {
    void customerProfileId;
    return Promise.resolve(null);
  }
}
