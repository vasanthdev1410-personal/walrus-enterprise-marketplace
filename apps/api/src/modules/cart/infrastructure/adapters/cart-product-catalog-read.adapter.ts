import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  ProductCatalogReadPort,
  ProductCatalogFacts,
  ProductCatalogSkuFacts,
} from '../../../product-catalog/domain/ports/product-catalog-read.port';

/**
 * WEMP-M07-SPEC-001 (decisions D-05/D-12/D-13). Adapts the Module 04
 * ProductCatalogReadPort for Module 07 cart-level consumption. The adapter
 * is a thin pass-through that makes the dependency direction explicit and
 * allows M07-M4 to swap the adapter for authorization-gated variants
 * without changing the application service.
 *
 * Used by the cart application service for:
 * - Price snapshot at add-to-cart (D-05: server-side M04 sellingPrice authority)
 * - Product/SKU availability check at add-to-cart (D-12/D-13: PUBLISHED gate)
 * - Price revalidation before checkout (deferred to M08)
 *
 * Fail closed: unknown or non-PUBLISHED products/SKUs resolve to null;
 * the application service treats null as CART_PRODUCT_UNAVAILABLE /
 * CART_SKU_UNAVAILABLE.
 */
@Injectable()
export class CartProductCatalogReadAdapter {
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
