import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M05-SPEC-001 §11/§11.1 (decision D-10). The Module 04 facts Module
 * 05 consumes: SKU existence + PUBLISHED-state facts published by Module
 * 04's approved `ProductCatalogReadPort`. Module 05 never reads Module 04
 * storage (A-06); every fact arrives through this port, and any
 * missing/unknown/non-PUBLISHED result resolves to null (fail closed).
 *
 * The concrete wiring to the Module 04 read port is M05-M4 work; M05-M1
 * defines only the shape Module 05 requires.
 */
export interface Module04SkuFacts {
  readonly skuId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly skuCode: string;
  readonly state: 'ACTIVE' | 'CLOSED';
}

export interface Module04ProductCatalogReadPort {
  /**
   * Returns the SKU fact for a sellable unit, or null when the SKU is
   * unknown or its product is not PUBLISHED (Module 04 D-12 visibility
   * gate). Fail closed: consumers treat null as UNAVAILABLE.
   */
  getConsumableSkuFact(skuId: UuidV7): Promise<Module04SkuFacts | null>;
}
