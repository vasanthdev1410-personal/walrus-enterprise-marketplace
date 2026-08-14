import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Admin product moderation E2E (M04-M6). The M04-M5 admin API is mocked at
 * the network layer following the exact envelope. The UI never decides access
 * — the mocked server returns 403 for ungranted reviewers and the UI shows
 * the generic access-denied state.
 */

const SELLER_ID = '0191310f-789a-7123-8123-000000000003';
const PRODUCT_ID = '0191310f-789a-7123-8123-000000000011';

const ok = (data: unknown, status = 200): { status: number; body: string } => ({
  status,
  body: JSON.stringify({ data, meta: { apiVersion: 'v1' }, correlationId: 'e2e' }),
});

const error = (status: number, message: string): { status: number; body: string } => ({
  status,
  body: JSON.stringify({ success: false, message, errorCode: 'UNEXPECTED_ERROR', errors: [] }),
});

const productDetail = {
  productId: PRODUCT_ID,
  sellerProfileId: SELLER_ID,
  categoryId: '0191310f-789a-7123-8123-000000000005',
  name: 'Espresso machine',
  state: 'SUBMITTED',
  sellingPrice: 499.99,
  version: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  variants: [],
  skus: [{ skuId: '0191310f-789a-7123-8123-000000000013', skuCode: 'WLR-001', state: 'ACTIVE' }],
  media: [],
  transitions: [
    { toState: 'DRAFT', stateVersion: 1, actorKind: 'SELLER', transitionedAt: 't1' },
    {
      fromState: 'DRAFT',
      toState: 'SUBMITTED',
      stateVersion: 2,
      actorKind: 'SELLER',
      transitionedAt: 't2',
    },
  ],
  audit: [{ eventType: 'PRODUCT_SUBMITTED', actorIdentityId: 'u1', occurredAt: 't2' }],
};

async function mockAdminCatalogApi(
  page: Page,
  reviewState: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (method === 'GET' && /^\/admin\/products$/.test(path)) {
      await route.fulfill(ok({ products: [productDetail] }));
      return;
    }
    if (method === 'GET' && path.endsWith('/media')) {
      await route.fulfill(ok({ media: [] }));
      return;
    }
    if (method === 'GET' && /^\/admin\/products\/[^/]+$/.test(path)) {
      await route.fulfill(ok({ product: reviewState }));
      return;
    }
    if (method === 'POST' && path.endsWith('/review')) {
      await route.fulfill(
        ok({ product: { productId: PRODUCT_ID, state: 'UNDER_REVIEW', version: 3 } }),
      );
      return;
    }
    await route.fulfill(error(404, 'PRODUCT_NOT_FOUND'));
  });
}

test('admin reviews a submitted product through to UNDER_REVIEW', async ({ page }) => {
  const state: Record<string, unknown> = productDetail;
  await mockAdminCatalogApi(page, state);

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: /Espresso machine/ }).click();
  await expect(page.getByRole('heading', { name: 'Espresso machine' })).toBeVisible();
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
  await expect(page.getByText('WLR-001')).toBeVisible();

  // Lifecycle history renders append-only transitions.
  await expect(page.getByText('Initial → Draft')).toBeVisible();
  await expect(page.getByText('Draft → Submitted')).toBeVisible();

  await page.getByRole('button', { name: 'Claim review' }).click();
  await expect(page.getByText('Review decision recorded.')).toBeVisible();
});

test('admin rejects a product with a mandatory reason', async ({ page }) => {
  await mockAdminCatalogApi(page, productDetail);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: /Espresso machine/ }).click();

  // Reason is required for reject — without it the request never leaves the UI.
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(
    page.getByText('The request could not be completed. Check the entered details and try again.'),
  ).toBeVisible();

  await page.getByLabel(/Reason/).fill('policy-002');
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Review decision recorded.')).toBeVisible();
});

test('admin sees the generic access-denied state when the grant is missing', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill(error(403, 'AUTHORIZATION_DENIED'));
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Products' }).click();
  await expect(page.getByText('You do not have permission to perform this action.')).toBeVisible();
});

test('admin filters the product list by state', async ({ page }) => {
  await mockAdminCatalogApi(page, productDetail);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByLabel('State').selectOption('SUBMITTED');
  await expect(page.getByRole('button', { name: /Espresso machine/ })).toBeVisible();
});
