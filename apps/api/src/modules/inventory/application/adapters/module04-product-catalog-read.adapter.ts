import { Inject, Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { ProductCatalogReadPort } from '../../../product-catalog/domain/ports/product-catalog-read.port';
import { PRODUCT_CATALOG_READ } from '../../../product-catalog/product-catalog.tokens';
import type {
  Module04ProductCatalogReadPort,
  Module04SkuFacts,
} from '../../domain/ports/module-04-product-catalog.port';

/**
 * WEMP-M05-SPEC-001 §11/§11.1 (decision D-10; M05-M4). The real Module 04
 * ↔ Module 05 SKU-fact wiring: delegates to Module 04's approved
 * `ProductCatalogReadPort` (published through the PRODUCT_CATALOG_READ
 * token). Module 05 never reads Module 04 storage (A-06) — the SKU
 * existence + PUBLISHED-state gate + SKU lifecycle state arrive only
 * through this port. Fail closed: a null fact or any resolution error
 * resolves to null (never a fabricated fact); consumers treat null as
 * UNAVAILABLE.
 */
@Injectable()
export class Module04ProductCatalogReadAdapter implements Module04ProductCatalogReadPort {
  public constructor(
    @Inject(PRODUCT_CATALOG_READ)
    private readonly catalog: ProductCatalogReadPort,
  ) {}

  public async getConsumableSkuFact(skuId: UuidV7): Promise<Module04SkuFacts | null> {
    try {
      const fact = await this.catalog.getConsumableSkuFacts(skuId);
      if (fact === null) {
        return null;
      }
      return {
        skuId: fact.skuId,
        sellerProfileId: fact.sellerProfileId,
        skuCode: fact.skuCode,
        state: fact.state,
      };
    } catch {
      // Fail closed: a Module 04 resolution failure never surfaces as a fact.
      return null;
    }
  }
}
