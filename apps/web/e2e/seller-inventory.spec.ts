import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Seller inventory E2E (M05-M5). The M05-M5 API is mocked at the browser
 * network layer following the exact envelope. The UI never decides access —
 * mocked server decisions (including 403 for cross-organization SKUs) surface
 * as generic safe states.
 */

const SELLER_ID = '0191310f-789a-7123-8123-000000000003';
const SKU_ID = '0191310f-789a-7123-8123-000000000007';

const ok = (data: unknown, status = 200): { status: number; body: string } => ({
  status,
  body: JSON.stringify({ data, meta: { apiVersion: 'v1' }, correlationId: 'e2e' }),
});

const error = (status: number, message: string): { status: number; body: string } => ({
  status,
  body: JSON.stringify({ success: false, message, errorCode: 'UNEXPECTED_ERROR', errors: [] }),
});

const profile = {
  sellerProfileId: SELLER_ID,
  state: 'ACTIVE',
  complianceState: 'COMPLIANT',
  version: 5,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  organization: {
    legalName: 'Walrus Retail',
    tradeName: 'Walrus',
    businessAddress: '1 Market Street',
  },
  members: [],
};

const inventoryEntry = {
  skuId: SKU_ID,
  onHand: 12,
  reserved: 2,
  available: 10,
  version: 2,
  label: 'IN_STOCK',
};

const movement = {
  movementId: '0191310f-789a-7123-8123-000000000010',
  movementType: 'STOCK_IN',
  delta: 12,
  resultingOnHand: 12,
  resultingReserved: 0,
  actorIdentityId: '0191310f-789a-7123-8123-000000000001',
  occurredAt: '2026-08-10T00:00:00.000Z',
};

async function mockSellerInventoryApi(
  page: Page,
  listState: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (method === 'GET' && path === '/seller/profile') {
      await route.fulfill(ok({ profile }));
      return;
    }
    if (method === 'GET' && /^\/seller\/inventory$/.test(path)) {
      await route.fulfill(ok({ inventory: [listState] }));
      return;
    }
    if (method === 'GET' && /^\/seller\/inventory\/[^/]+\/movements$/.test(path)) {
      await route.fulfill(ok({ movements: [movement] }));
      return;
    }
    if (method === 'GET' && /^\/seller\/inventory\/[^/]+$/.test(path)) {
      await route.fulfill(ok({ inventory: listState }));
      return;
    }
    if (method === 'POST' && /^\/seller\/inventory\/[^/]+\/movements$/.test(path)) {
      await route.fulfill(
        ok({ inventory: { skuId: SKU_ID, onHand: 17, reserved: 2, available: 15, version: 3 } }),
      );
      return;
    }
    await route.fulfill(error(404, 'INVENTORY_NOT_FOUND'));
  });
}

test('seller lists own inventory with derived stock labels', async ({ page }) => {
  await mockSellerInventoryApi(page, inventoryEntry);
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Inventory' }).click();
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await expect(page.getByText('In stock')).toBeVisible();
  await expect(page.getByText(/10 available \(12 on hand, 2 reserved\)/)).toBeVisible();
});

test('seller opens the SKU detail and reads the movement ledger', async ({ page }) => {
  await mockSellerInventoryApi(page, inventoryEntry);
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Inventory' }).click();
  await page.getByRole('button', { name: SKU_ID }).click();
  await expect(page.getByRole('heading', { name: 'SKU inventory' })).toBeVisible();
  await expect(page.getByText(/STOCK_IN \+12/)).toBeVisible();
});

test('seller applies a stock-in adjustment and confirms the new availability', async ({ page }) => {
  await mockSellerInventoryApi(page, inventoryEntry);
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Inventory' }).click();
  await page.getByRole('button', { name: SKU_ID }).click();
  await page.getByRole('button', { name: 'Adjust stock' }).click();
  await page.getByLabel(/Delta/).fill('5');
  await page.getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByText(/Adjustment applied — 15 available now/)).toBeVisible();
});

test('seller sees a generic access-denied state for a cross-organization SKU', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (method === 'GET' && path === '/seller/profile') {
      await route.fulfill(ok({ profile }));
      return;
    }
    if (method === 'GET' && /^\/seller\/inventory$/.test(path)) {
      await route.fulfill(ok({ inventory: [inventoryEntry] }));
      return;
    }
    if (method === 'GET' && /^\/seller\/inventory\/[^/]+\/movements$/.test(path)) {
      await route.fulfill(ok({ movements: [] }));
      return;
    }
    if (method === 'GET' && /^\/seller\/inventory\/[^/]+$/.test(path)) {
      await route.fulfill(error(403, 'AUTHORIZATION_DENIED'));
      return;
    }
    await route.fulfill(error(404, 'INVENTORY_NOT_FOUND'));
  });
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Inventory' }).click();
  await page.getByRole('button', { name: SKU_ID }).click();
  await expect(page.getByText('You do not have permission to perform this action.')).toBeVisible();
});
