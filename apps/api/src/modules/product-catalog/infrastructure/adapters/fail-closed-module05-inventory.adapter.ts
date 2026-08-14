import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  InventoryAvailabilityResult,
  Module05InventoryContractPort,
} from '../../domain/ports/module-05-inventory-contract.port';

/**
 * WEMP-M04-SPEC-001 §11 / WEMP-M04-CONTRACT-001 Part C (decision D-08). The
 * fail-closed Module 04 ↔ Module 05 inventory contract. Module 04 is
 * definition-only and never persists stock quantities; Module 05 owns stock
 * levels, availability, reservations and movements. Until an approved Module
 * 05 specification exists, this adapter returns UNAVAILABLE for every SKU —
 * no availability facts are ever fabricated. The exact contract shape becomes
 * normative when the Module 05 specification is approved.
 */ @Injectable()
export class FailClosedModule05InventoryContractAdapter implements Module05InventoryContractPort {
  public getAvailability(skuId: UuidV7): Promise<InventoryAvailabilityResult> {
    void skuId;
    return Promise.resolve({ outcome: 'UNAVAILABLE' });
  }
}
