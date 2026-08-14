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

export interface ProductCatalogReadPort {
  /**
   * Returns the consumable (PUBLISHED) product facts, or null when the
   * product is not PUBLISHED or is unknown. Fail closed: non-PUBLISHED and
   * unknown states are indistinguishable to consumers.
   */
  getConsumableProductFacts(productId: UuidV7): Promise<ProductCatalogFacts | null>;
}
