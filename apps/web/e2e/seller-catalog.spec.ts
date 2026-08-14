import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Seller product catalog E2E (M04-M6). The M04-M5 API is mocked at the
 * browser network layer following the exact envelope. The UI never decides
 * access — mocked server decisions (including 401/409) surface as generic
 * safe states.
 */

const SELLER_ID = '0191310f-789a-7123-8123-000000000003';
const CATEGORY_ID = '0191310f-789a-7123-8123-000000000005';
const PRODUCT_ID = '0191310f-789a-7123-8123-000000000011';

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

const productDetail = {
  productId: PRODUCT_ID,
  sellerProfileId: SELLER_ID,
  categoryId: CATEGORY_ID,
  name: 'Espresso machine',
  state: 'DRAFT',
  sellingPrice: 499.99,
  version: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  variants: [],
  skus: [{ skuId: '0191310f-789a-7123-8123-000000000013', skuCode: 'WLR-001', state: 'ACTIVE' }],
  media: [],
};

async function mockCatalogApi(page: Page, listState: Record<string, unknown>): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (method === 'GET' && path === '/seller/profile') {
      await route.fulfill(ok({ profile }));
      return;
    }
    if (method === 'GET' && path === '/seller/categories') {
      await route.fulfill(
        ok({ categories: [{ categoryId: CATEGORY_ID, name: 'Appliances', state: 'ACTIVE' }] }),
      );
      return;
    }
    if (method === 'GET' && /^\/seller\/products$/.test(path)) {
      await route.fulfill(ok({ products: [listState] }));
      return;
    }
    if (method === 'GET' && /^\/seller\/products\/[^/]+$/.test(path)) {
      await route.fulfill(ok({ product: { ...productDetail, state: listState.state } }));
      return;
    }
    if (method === 'POST' && path === '/seller/products') {
      await route.fulfill(
        ok({ product: { productId: PRODUCT_ID, state: 'DRAFT', version: 1 } }, 201),
      );
      return;
    }
    if (method === 'POST' && /^\/seller\/products\/[^/]+\/submit$/.test(path)) {
      await route.fulfill(
        ok({ product: { productId: PRODUCT_ID, state: 'SUBMITTED', version: 2 } }),
      );
      return;
    }
    if (method === 'POST' && /^\/seller\/products\/[^/]+\/close$/.test(path)) {
      await route.fulfill(ok({ product: { productId: PRODUCT_ID, state: 'CLOSED', version: 2 } }));
      return;
    }
    await route.fulfill(error(404, 'PRODUCT_NOT_FOUND'));
  });
}

test('seller lists own products and opens the detail view', async ({ page }) => {
  await mockCatalogApi(page, {
    ...productDetail,
    state: 'PUBLISHED',
    version: 6,
  });
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Catalog' }).click();
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  await page.getByRole('button', { name: /Espresso machine/ }).click();
  await expect(page.getByRole('heading', { name: 'Espresso machine' })).toBeVisible();
  await expect(page.getByText('Published')).toBeVisible();
  await expect(page.getByText('WLR-001')).toBeVisible();
});

test('seller creates a product and is taken to its detail', async ({ page }) => {
  await mockCatalogApi(page, productDetail);
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Catalog' }).click();
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('Name').fill('Espresso machine');
  await page.getByLabel('Category').selectOption(CATEGORY_ID);
  await page.getByLabel('Selling price (INR)').fill('499.99');
  await page.getByLabel('SKU code').fill('WLR-001');
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page.getByRole('heading', { name: 'Espresso machine' })).toBeVisible();
});

test('seller submits a DRAFT product for review', async ({ page }) => {
  await mockCatalogApi(page, productDetail);
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Catalog' }).click();
  await page.getByRole('button', { name: /Espresso machine/ }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Product submitted for review.')).toBeVisible();
});

test('seller sees a safe conflict on a stale-version submit', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (method === 'GET' && path === '/seller/profile') {
      await route.fulfill(ok({ profile }));
      return;
    }
    if (method === 'GET' && path === '/seller/categories') {
      await route.fulfill(ok({ categories: [] }));
      return;
    }
    if (method === 'GET' && /^\/seller\/products$/.test(path)) {
      await route.fulfill(ok({ products: [productDetail] }));
      return;
    }
    if (method === 'GET' && /^\/seller\/products\/[^/]+$/.test(path)) {
      await route.fulfill(ok({ product: productDetail }));
      return;
    }
    if (method === 'POST' && path.endsWith('/submit')) {
      await route.fulfill(error(409, 'PRODUCT_STATE_CONFLICT'));
      return;
    }
    await route.fulfill(error(404, 'PRODUCT_NOT_FOUND'));
  });
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Catalog' }).click();
  await page.getByRole('button', { name: /Espresso machine/ }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(
    page.getByText('This action conflicts with the current state. Refresh and try again.'),
  ).toBeVisible();
});

test('seller sees the generic session-expired state on 401', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill(error(401, 'AUTHENTICATION_ASSURANCE_INSUFFICIENT'));
  });
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Catalog' }).click();
  await expect(page.getByText('Session expired')).toBeVisible();
});
