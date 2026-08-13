import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Admin seller review E2E. The M03-M5 admin API is mocked at the network layer
 * following the exact envelope. The UI never decides access — the mocked
 * server returns 403 for ungranted reviewers and the UI shows the generic
 * access-denied state.
 */

const ok = (data: unknown): { status: number; body: string } => ({
  status: 200,
  body: JSON.stringify({ data, meta: { apiVersion: 'v1' }, correlationId: 'e2e' }),
});

const error = (status: number, message: string): { status: number; body: string } => ({
  status,
  body: JSON.stringify({ success: false, message, errorCode: 'UNEXPECTED_ERROR', errors: [] }),
});

const sellerDetail = {
  sellerProfileId: '0191310f-789a-7123-8123-000000000003',
  state: 'SUBMITTED',
  complianceState: 'IN_PROGRESS',
  version: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  organization: { legalName: 'Walrus Retail', tradeName: 'Walrus', businessAddress: '1 Market Street' },
  members: [],
};

async function mockAdminApi(page: Page, reviewState: Record<string, unknown>): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');

    if (request.method() === 'GET' && path === '/admin/sellers') {
      await route.fulfill(
        ok({ sellers: [{ sellerProfileId: sellerDetail.sellerProfileId, state: 'SUBMITTED', complianceState: 'IN_PROGRESS', version: 2, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }] }),
      );
      return;
    }
    if (request.method() === 'GET' && path.startsWith('/admin/sellers/') && path.endsWith('/evidence')) {
      await route.fulfill(
        ok({
          evidence: [
            {
              verificationId: '0191310f-789a-7123-8123-000000000004',
              verificationType: 'GST',
              verificationState: 'SUBMITTED',
              generation: 1,
              evidenceId: '0191310f-789a-7123-8123-000000000008',
              evidenceType: 'GST_CERTIFICATE',
              evidenceReference: 'ref:object:opaque',
              evidenceDigest: 'a'.repeat(64),
              uploadedByIdentityId: '0191310f-789a-7123-8123-000000000001',
              uploadedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
      );
      return;
    }
    if (request.method() === 'GET' && path.startsWith('/admin/sellers/')) {
      await route.fulfill(ok({ seller: reviewState }));
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/review')) {
      await route.fulfill(ok({ seller: { state: 'APPROVED', version: 3 } }));
      return;
    }
    await route.fulfill(error(404, 'SELLER_NOT_FOUND'));
  });
}

test('admin reviews a submitted seller through to APPROVED', async ({ page }) => {
  const state: Record<string, unknown> = sellerDetail;
  await mockAdminApi(page, state);

  await page.goto('/admin');
  await expect(page.getByRole('button', { name: /0191310f-789a-7123-8123-000000000003/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /0191310f-789a-7123-8123-000000000003/ }).first().click();
  await expect(page.getByRole('heading', { name: /Seller 0191310f/ })).toBeVisible();

  // Evidence metadata renders metadata only — never the raw reference.
  await expect(page.getByText('GST_CERTIFICATE')).toBeVisible();
  await expect(page.getByText(/ref:object:opaque/)).not.toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Review decision recorded.')).toBeVisible();
});

test('admin sees the generic access-denied state when the grant is missing', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill(error(403, 'AUTHORIZATION_DENIED'));
  });
  await page.goto('/admin');
  await expect(
    page.getByText('You do not have permission to perform this action.'),
  ).toBeVisible();
});

test('admin suspension requires a reason before calling the API', async ({ page }) => {
  const detail = { ...sellerDetail, state: 'ACTIVE', version: 5 };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'GET' && path === '/admin/sellers') {
      await route.fulfill(
        ok({ sellers: [{ sellerProfileId: detail.sellerProfileId, state: 'ACTIVE', complianceState: 'COMPLIANT', version: 5, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }] }),
      );
      return;
    }
    if (request.method() === 'GET' && path.startsWith('/admin/sellers/') && !path.endsWith('/evidence')) {
      await route.fulfill(ok({ seller: detail }));
      return;
    }
    if (request.method() === 'GET' && path.endsWith('/evidence')) {
      await route.fulfill(ok({ evidence: [] }));
      return;
    }
    await route.fulfill(error(404, 'SELLER_NOT_FOUND'));
  });

  await page.goto('/admin');
  await page.getByRole('button', { name: /0191310f/ }).first().click();
  await page.getByRole('button', { name: 'Suspend' }).click();
  // No reason supplied → the API is not called; a validation notice appears.
  await expect(page.getByText('The request could not be completed. Check the entered details and try again.')).toBeVisible();
});
