import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  Module04ProductCatalogReadPort,
  Module04SkuFacts,
} from '../../domain/ports/module-04-product-catalog.port';

/**
 * WEMP-M05-SPEC-001 §11 (decision D-10). Fail-closed Module 04 ↔ Module 05
 * SKU-fact wiring for M05-M3: no SKU fact is ever resolved, so every
 * inventory mutation requiring a PUBLISHED SKU is denied until M05-M4 wires
 * the real Module 04 `ProductCatalogReadPort` adapter. Module 05 never
 * reads Module 04 storage (A-06); a missing wiring must never surface as
 * an available SKU.
 */
@Injectable()
export class FailClosedModule04ProductCatalogAdapter implements Module04ProductCatalogReadPort {
  public getConsumableSkuFact(skuId: UuidV7): Promise<Module04SkuFacts | null> {
    void skuId;
    return Promise.resolve(null);
  }
}
