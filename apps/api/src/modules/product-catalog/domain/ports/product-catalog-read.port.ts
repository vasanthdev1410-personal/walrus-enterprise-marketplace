import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M04-SPEC-001 §5 invariant 1 / WEMP-M04-CONTRACT-001 Part B
 * (decision D-12). The fail-closed catalog-consumption port for trading
 * modules (05/07/08). Only PUBLISHED products are consumable; any other or
 * unknown state is excluded. Consumers are wired only through future
 * approved contracts — until then, the port is internal-use only (e.g.
 * permission-gated admin views).
 */
export interface ProductCatalogFacts {
  readonly productId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly skuId: UuidV7;
  readonly skuCode: string;
  readonly sellingPrice: number;
}

/**
 * WEMP-M05-SPEC-001 §11.1 (decision D-10). SKU-keyed consumable facts
 * published by Module 04 for Module 05: SKU existence + PUBLISHED-state
 * gate + the SKU's own lifecycle state. Module 05 consumes these through
 * its approved Module 04 read port — never by reading Module 04 storage
 * (A-06).
 */
export interface ProductCatalogSkuFacts {
  readonly skuId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly skuCode: string;
  readonly state: 'ACTIVE' | 'CLOSED';
}

export interface ProductCatalogReadPort {
  /**
   * Returns the consumable (PUBLISHED) product facts, or null when the
   * product is not PUBLISHED or is unknown. Fail closed: non-PUBLISHED and
   * unknown states are indistinguishable to consumers.
   */
  getConsumableProductFacts(productId: UuidV7): Promise<ProductCatalogFacts | null>;
  /**
   * WEMP-M05-SPEC-001 §11.1 (D-10, M05-M4 SKU-fact wiring). Returns the
   * consumable SKU facts for a sellable unit, or null when the SKU is
   * unknown or its product is not PUBLISHED (the Module 04 D-12 visibility
   * gate). The SKU's own lifecycle state (ACTIVE/CLOSED) is carried so
   * Module 05 can enforce D-15 read-only pools for CLOSED SKUs. Fail
   * closed: unknown and non-PUBLISHED SKUs are indistinguishable.
   */
  getConsumableSkuFacts(skuId: UuidV7): Promise<ProductCatalogSkuFacts | null>;
}
