import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Admin inventory E2E (M05-M5). The M05-M5 admin API is mocked at the network
 * layer following the exact envelope. The UI never decides access — the
 * mocked server returns 403 for ungranted reviewers and the UI shows the
 * generic access-denied state. Corrections require a mandatory reason and the
 * D-14 thresholds are admin-managed and version-checked.
 */

const SKU_ID = '0191310f-789a-7123-8123-000000000007';
const SELLER_ID = '0191310f-789a-7123-8123-000000000003';

const ok = (data: unknown, status = 200): { status: number; body: string } => ({
  status,
  body: JSON.stringify({ data, meta: { apiVersion: 'v1' }, correlationId: 'e2e' }),
});

const error = (status: number, message: string): { status: number; body: string } => ({
  status,
  body: JSON.stringify({ success: false, message, errorCode: 'UNEXPECTED_ERROR', errors: [] }),
});

const inventoryDetail = {
  skuId: SKU_ID,
  sellerProfileId: SELLER_ID,
  onHand: 30,
  reserved: 0,
  available: 30,
  version: 3,
  label: 'IN_STOCK',
  audit: [
    {
      eventType: 'POOL_CORRECTED',
      actorIdentityId: '0191310f-789a-7123-8123-000000000001',
      occurredAt: '2026-08-12T00:00:00.000Z',
    },
  ],
  movements: [
    {
      movementId: '0191310f-789a-7123-8123-000000000010',
      movementType: 'COUNT_CORRECTION',
      delta: 10,
      resultingOnHand: 30,
      resultingReserved: 0,
      actorIdentityId: '0191310f-789a-7123-8123-000000000001',
      occurredAt: '2026-08-12T00:00:00.000Z',
    },
  ],
};

async function mockAdminInventoryApi(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (method === 'GET' && path === '/admin/inventory') {
      await route.fulfill(
        ok({
          inventory: [
            {
              skuId: SKU_ID,
              onHand: 30,
              reserved: 0,
              available: 30,
              version: 3,
              label: 'IN_STOCK',
            },
          ],
        }),
      );
      return;
    }
    if (method === 'GET' && /^\/admin\/inventory\/[^/]+\/movements$/.test(path)) {
      await route.fulfill(ok({ movements: inventoryDetail.movements }));
      return;
    }
    if (method === 'GET' && /^\/admin\/inventory\/[^/]+$/.test(path)) {
      await route.fulfill(ok({ inventory: inventoryDetail }));
      return;
    }
    if (method === 'POST' && /^\/admin\/inventory\/[^/]+\/corrections$/.test(path)) {
      await route.fulfill(
        ok({ inventory: { skuId: SKU_ID, onHand: 25, reserved: 0, available: 25, version: 4 } }),
      );
      return;
    }
    if (method === 'GET' && path === '/admin/inventory-config') {
      await route.fulfill(
        ok({ config: { lowStockThreshold: 1, outOfStockThreshold: 0, version: 0 } }),
      );
      return;
    }
    if (method === 'PATCH' && path === '/admin/inventory-config') {
      await route.fulfill(
        ok({ config: { lowStockThreshold: 3, outOfStockThreshold: 2, version: 1 } }),
      );
      return;
    }
    await route.fulfill(error(404, 'INVENTORY_NOT_FOUND'));
  });
}

test('admin lists stock pools and opens the SKU detail with audit records', async ({ page }) => {
  await mockAdminInventoryApi(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await page.getByRole('button', { name: SKU_ID }).click();
  await expect(page.getByRole('heading', { name: 'SKU inventory detail' })).toBeVisible();
  await expect(page.getByText('POOL_CORRECTED')).toBeVisible();
  await expect(page.getByText(/COUNT_CORRECTION \+10/)).toBeVisible();
});

test('admin applies a correction with the mandatory reason', async ({ page }) => {
  await mockAdminInventoryApi(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('button', { name: SKU_ID }).click();
  await page.getByRole('button', { name: 'Correct stock' }).click();
  await page.getByLabel(/Target on-hand/).fill('25');
  await page.getByLabel(/Reason reference/).fill('count-2026-08-15');
  await page.getByRole('button', { name: 'Apply correction' }).click();
  await expect(page.getByText(/Correction applied — 25 available now/)).toBeVisible();
});

test('admin reads and updates the D-14 threshold configuration', async ({ page }) => {
  await mockAdminInventoryApi(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Inventory thresholds' }).click();
  await expect(page.getByRole('heading', { name: 'Inventory thresholds' })).toBeVisible();
  await expect(page.getByText('Low-stock threshold: 1')).toBeVisible();
  await expect(page.getByText('Out-of-stock threshold: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Update thresholds' }).click();
  await page.getByLabel(/Low-stock threshold/).fill('3');
  await page.getByLabel(/Out-of-stock threshold/).fill('2');
  await page.getByRole('button', { name: 'Save thresholds' }).click();
  await expect(page.getByText(/Thresholds updated — version 1/)).toBeVisible();
});

test('admin sees the generic access-denied state when the grant is missing', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill(error(403, 'AUTHORIZATION_DENIED'));
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(page.getByText('You do not have permission to perform this action.')).toBeVisible();
});
