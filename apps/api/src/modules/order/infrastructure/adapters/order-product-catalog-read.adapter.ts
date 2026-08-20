import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  ProductCatalogReadPort,
  ProductCatalogFacts,
  ProductCatalogSkuFacts,
} from '../../../product-catalog/domain/ports/product-catalog-read.port';

/**
 * WEMP-M08-SPEC-001 (decisions D-03/D-04). Adapts the Module 04
 * ProductCatalogReadPort for Module 08 order-level consumption. The adapter
 * is a thin pass-through that makes the dependency direction explicit and
 * allows M08-M4 to swap the adapter for authorization-gated variants
 * without changing the application service.
 *
 * Used by the order application service for:
 * - Price revalidation at checkout (D-03: server-side M04 sellingPrice authority)
 * - Product/SKU availability check at order creation (D-04: PUBLISHED gate)
 *
 * Fail closed: unknown or non-PUBLISHED products/SKUs resolve to null;
 * the application service treats null as ORDER_PRODUCT_UNAVAILABLE /
 * ORDER_SKU_UNAVAILABLE.
 */
@Injectable()
export class OrderProductCatalogReadAdapter {
  public constructor(private readonly productCatalogRead: ProductCatalogReadPort) {}

  /** Resolves PUBLISHED product facts, or null when not published/unknown. */
  public async getConsumableProductFacts(productId: UuidV7): Promise<ProductCatalogFacts | null> {
    return this.productCatalogRead.getConsumableProductFacts(productId);
  }

  /** Resolves PUBLISHED SKU facts, or null when not published/unknown. */
  public async getConsumableSkuFacts(skuId: UuidV7): Promise<ProductCatalogSkuFacts | null> {
    return this.productCatalogRead.getConsumableSkuFacts(skuId);
  }
}
