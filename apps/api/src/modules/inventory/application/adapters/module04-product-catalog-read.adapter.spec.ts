/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { ProductCatalogReadPort } from '../../../product-catalog/domain/ports/product-catalog-read.port';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Module04ProductCatalogReadAdapter } from './module04-product-catalog-read.adapter';

const SKU = new UuidV7('01913110-789a-7123-8123-000000001001');
const SELLER = new UuidV7('01913110-789a-7123-8123-000000001002');

function catalogMock(
  facts: Awaited<ReturnType<ProductCatalogReadPort['getConsumableSkuFacts']>>,
): jest.Mocked<ProductCatalogReadPort> {
  return {
    getConsumableSkuFacts: jest.fn().mockResolvedValue(facts),
  } as unknown as jest.Mocked<ProductCatalogReadPort>;
}

describe('Module04ProductCatalogReadAdapter (M05-M4, WEMP-M05-SPEC-001 §11.1 / D-10)', () => {
  it('delegates an ACTIVE consumable SKU fact from the Module 04 read port', async () => {
    const catalog = catalogMock({
      skuId: SKU,
      sellerProfileId: SELLER,
      skuCode: 'WLR-ESPRESSO-001',
      state: 'ACTIVE',
    });
    const adapter = new Module04ProductCatalogReadAdapter(catalog);

    await expect(adapter.getConsumableSkuFact(SKU)).resolves.toEqual({
      skuId: SKU,
      sellerProfileId: SELLER,
      skuCode: 'WLR-ESPRESSO-001',
      state: 'ACTIVE',
    });
    expect(catalog.getConsumableSkuFacts).toHaveBeenCalledWith(SKU);
  });

  it('carries a CLOSED SKU state for D-15 read-only pools', async () => {
    const catalog = catalogMock({
      skuId: SKU,
      sellerProfileId: SELLER,
      skuCode: 'WLR-ESPRESSO-001',
      state: 'CLOSED',
    });
    const adapter = new Module04ProductCatalogReadAdapter(catalog);

    const facts = await adapter.getConsumableSkuFact(SKU);
    expect(facts?.state).toBe('CLOSED');
  });

  it('resolves null when Module 04 reports no consumable fact (fail closed)', async () => {
    const adapter = new Module04ProductCatalogReadAdapter(catalogMock(null));

    await expect(adapter.getConsumableSkuFact(SKU)).resolves.toBeNull();
  });

  it('fails closed to null when the Module 04 read port raises (no fabricated fact)', async () => {
    const catalog = {
      getConsumableSkuFacts: jest.fn().mockRejectedValue(new Error('catalog unavailable')),
    } as unknown as jest.Mocked<ProductCatalogReadPort>;
    const adapter = new Module04ProductCatalogReadAdapter(catalog);

    await expect(adapter.getConsumableSkuFact(SKU)).resolves.toBeNull();
  });
});
