import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { FailClosedInventoryAdminAuthorizationAdapter } from './fail-closed-inventory-admin-authorization.adapter';
import { FailClosedModule02InventoryAuthorizationAdapter } from './fail-closed-module02-inventory-authorization.adapter';
import { FailClosedModule04ProductCatalogAdapter } from './fail-closed-module04-product-catalog.adapter';

const IDENTITY = new UuidV7('01900000-0000-7000-8000-000000000001');
const SELLER = new UuidV7('01900000-0000-7000-8000-000000000003');
const SKU = new UuidV7('01900000-0000-7000-8000-000000000005');

describe('FailClosedModule02InventoryAuthorizationAdapter (M05-M3 wiring, D-05/A-09)', () => {
  it('never resolves an association — every seller operation is denied', async () => {
    const adapter = new FailClosedModule02InventoryAuthorizationAdapter();
    const association = await adapter.resolveActiveAssociation(IDENTITY, SELLER);
    expect(association).toBeNull();
  });
});

describe('FailClosedModule04ProductCatalogAdapter (M05-M3 wiring, D-10)', () => {
  it('never resolves a SKU fact — every mutation requiring a PUBLISHED SKU is denied', async () => {
    const adapter = new FailClosedModule04ProductCatalogAdapter();
    const fact = await adapter.getConsumableSkuFact(SKU);
    expect(fact).toBeNull();
  });
});

describe('FailClosedInventoryAdminAuthorizationAdapter (M05-M3 wiring, D-05)', () => {
  it('never grants an administrative action', async () => {
    const adapter = new FailClosedInventoryAdminAuthorizationAdapter();
    expect(await adapter.isGranted(IDENTITY, 'inventory.adjust.admin')).toBe(false);
    expect(await adapter.isGranted(IDENTITY, 'inventory.audit.view')).toBe(false);
  });
});
