import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Seller onboarding E2E. The M03-M5 API is mocked at the browser network layer
 * (`/api/v1/**`) so the UI flows run without a live backend; the mocked
 * responses follow the exact M03-M5 envelope (`{ data, meta, correlationId }`).
 * Authorization remains server-side — the UI only reflects the mocked server
 * decisions, including the generic 401/403/409 states.
 */

const ok = (data: unknown): { status: number; body: string } => ({
  status: 200,
  body: JSON.stringify({ data, meta: { apiVersion: 'v1' }, correlationId: 'e2e' }),
});

const error = (status: number, message: string): { status: number; body: string } => ({
  status,
  body: JSON.stringify({ success: false, message, errorCode: 'UNEXPECTED_ERROR', errors: [] }),
});

const draftStatus = {
  sellerProfileId: '0191310f-789a-7123-8123-000000000003',
  state: 'DRAFT',
  complianceState: 'NOT_STARTED',
  version: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  organization: { legalName: 'Walrus Retail', tradeName: 'Walrus', businessAddress: '1 Market Street' },
  verifications: [],
};

async function mockSellerApi(page: Page, status: Record<string, unknown>): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');

    if (request.method() === 'GET' && path === '/seller/onboarding') {
      await route.fulfill(ok({ seller: status }));
      return;
    }
    if (request.method() === 'POST' && path === '/seller/onboarding') {
      await route.fulfill({ status: 201, body: ok({ seller: { state: 'DRAFT', version: 1 } }).body, headers: { 'Content-Type': 'application/json' } });
      return;
    }
    if (request.method() === 'POST' && path === '/seller/onboarding/submit') {
      await route.fulfill(ok({ seller: { state: 'SUBMITTED', version: 2 } }));
      return;
    }
    await route.fulfill(error(404, 'SELLER_NOT_FOUND'));
  });
}

test('seller sees the start-onboarding prompt when no seller exists', async ({ page }) => {
  // No seller association → the server answers 404 SELLER_NOT_FOUND.
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill(error(404, 'SELLER_NOT_FOUND'));
  });
  await page.goto('/seller');
  await expect(page.getByRole('heading', { name: 'Seller portal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start onboarding' })).toBeVisible();
});

test('seller submits onboarding and the UI reflects SUBMITTED', async ({ page }) => {
  // Start with a DRAFT status; after submit the next GET returns SUBMITTED.
  let state: 'DRAFT' | 'SUBMITTED' = 'DRAFT';
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'GET' && path === '/seller/onboarding') {
      await route.fulfill(ok({ seller: { ...draftStatus, state } }));
      return;
    }
    if (request.method() === 'POST' && path === '/seller/onboarding/submit') {
      state = 'SUBMITTED';
      await route.fulfill(ok({ seller: { state: 'SUBMITTED', version: 2 } }));
      return;
    }
    await route.fulfill(error(404, 'SELLER_NOT_FOUND'));
  });

  await page.goto('/seller');
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('heading', { name: 'Under review' })).toBeVisible();
});

test('seller sees a generic session-expired state on 401', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill(error(401, 'AUTHENTICATION_ASSURANCE_INSUFFICIENT'));
  });
  await page.goto('/seller');
  await expect(page.getByText('Session expired')).toBeVisible();
});

test('seller sees a safe conflict message on 409 during submit', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'GET' && path === '/seller/onboarding') {
      await route.fulfill(ok({ seller: draftStatus }));
      return;
    }
    await route.fulfill(error(409, 'SELLER_STATE_CONFLICT'));
  });
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(
    page.getByText('This action conflicts with the current state. Refresh and try again.'),
  ).toBeVisible();
});

test('seller dashboard exposes the approved post-approval sections for ACTIVE sellers', async ({ page }) => {
  await mockSellerApi(page, {
    ...draftStatus,
    state: 'ACTIVE',
    complianceState: 'COMPLIANT',
    version: 5,
  });
  await page.goto('/seller');
  await expect(page.getByRole('heading', { name: 'Active seller' })).toBeVisible();
  // Scope to the dashboard's section list: the portal navigation exposes
  // buttons with the same labels.
  const sections = page.getByRole('list');
  for (const label of ['Profile', 'Verification status', 'Warehouses', 'Agreements', 'Members']) {
    await expect(sections.getByRole('button', { name: label })).toBeVisible();
  }
});
