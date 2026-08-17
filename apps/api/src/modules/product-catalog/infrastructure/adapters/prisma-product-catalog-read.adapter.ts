import { Inject, Injectable } from '@nestjs/common';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  ProductCatalogFacts,
  ProductCatalogReadPort,
  ProductCatalogSkuFacts,
} from '../../domain/ports/product-catalog-read.port';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import { PRODUCT_CATALOG_REPOSITORY } from '../../product-catalog.tokens';

/**
 * WEMP-M04-CONTRACT-001 Part B / WEMP-M05-SPEC-001 §11.1 (D-10, M05-M4
 * SKU-fact wiring). The real Module 04 `ProductCatalogReadPort`
 * implementation over Module 04's own repository. Only PUBLISHED products
 * are consumable (the Module 04 D-12 visibility gate); unknown or
 * non-PUBLISHED products/SKUs resolve to null — fail closed, so consumers
 * (Module 05) can never distinguish or fabricate facts. Module 05 never
 * reads Module 04 storage directly (A-06): every fact arrives through this
 * port. Any resolution error resolves to null (never a grant of facts).
 */
@Injectable()
export class PrismaProductCatalogReadAdapter implements ProductCatalogReadPort {
  public constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY)
    private readonly repository: ProductCatalogRepository,
  ) {}

  public async getConsumableProductFacts(productId: UuidV7): Promise<ProductCatalogFacts | null> {
    try {
      const product = await this.repository.findById(productId);
      // Fail closed: unknown and non-PUBLISHED products are indistinguishable.
      if (product?.properties.state !== 'PUBLISHED') {
        return null;
      }
      // A consumable product fact requires a sellable SKU fact; a product
      // without SKUs cannot be consumed (fail closed).
      const skus = await this.repository.findSkus(productId);
      const sku = skus.find((candidate) => candidate.properties.state === 'ACTIVE') ?? skus[0];
      if (sku === undefined) {
        return null;
      }
      return {
        productId,
        sellerProfileId: product.properties.sellerProfileId,
        skuId: sku.properties.skuId,
        skuCode: sku.properties.skuCode.value,
        sellingPrice: product.properties.sellingPrice.value,
      };
    } catch {
      // Fail closed: a storage/validation error never surfaces as facts.
      return null;
    }
  }

  public async getConsumableSkuFacts(skuId: UuidV7): Promise<ProductCatalogSkuFacts | null> {
    try {
      const sku = await this.repository.findSkuById(skuId);
      if (sku === null) {
        return null;
      }
      // Module 04 D-12 visibility gate: only SKUs of PUBLISHED products are
      // consumable. The SKU's own lifecycle state (ACTIVE/CLOSED) is carried
      // so Module 05 can enforce D-15 read-only pools for CLOSED SKUs.
      const product = await this.repository.findById(sku.properties.productId);
      // Fail closed: unknown and non-PUBLISHED products are indistinguishable.
      if (product?.properties.state !== 'PUBLISHED') {
        return null;
      }
      return {
        skuId,
        sellerProfileId: sku.properties.sellerProfileId,
        skuCode: sku.properties.skuCode.value,
        state: sku.properties.state,
      };
    } catch {
      // Fail closed: unknown, non-PUBLISHED and errored SKUs are
      // indistinguishable to consumers.
      return null;
    }
  }
}
