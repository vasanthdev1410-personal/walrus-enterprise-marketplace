import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * M06-M5 customer E2E (WEMP-M06-PLAN-001, M06-M5 test strategy). The M06-M5
 * API is mocked at the browser network layer (`/api/v1/**`) so the UI flows
 * run without a live backend; the mocked responses follow the exact M06
 * envelope (`{ data, meta, correlationId }`). Authorization remains
 * server-side — the UI only reflects the mocked server decisions, including
 * the generic 403/404 states. Covers the customer self-service flow and the
 * admin lifecycle/audit flow (D-12 web scope).
 */

const ok = (data: unknown): { status: number; body: string } => ({
  status: 200,
  body: JSON.stringify({ data, meta: { apiVersion: 'v1' }, correlationId: 'e2e' }),
});

const error = (status: number, message: string): { status: number; body: string } => ({
  status,
  body: JSON.stringify({ success: false, message, errorCode: 'UNEXPECTED_ERROR', errors: [] }),
});

const PROFILE_ID = '0191310f-789a-7123-8123-000000000003';
const ADDRESS_ID = '0191310f-789a-7123-8123-000000000004';

const profile = {
  customerProfileId: PROFILE_ID,
  state: 'ACTIVE',
  version: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const addresses = [
  {
    addressId: ADDRESS_ID,
    recipientName: 'Ada Lovelace',
    line1: '1 Analytical Way',
    city: 'London',
    postalCode: 'SW1A 1AA',
    countryCode: 'GB',
    roles: ['SHIPPING'],
    isDefaultShipping: true,
    isDefaultBilling: false,
    state: 'ACTIVE',
  },
];

test('customer portal renders own profile facts from the server', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'GET' && path === '/customer/profile') {
      await route.fulfill(ok({ profile }));
      return;
    }
    await route.fulfill(ok({}));
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Customer portal' })).toBeVisible();
  await expect(page.getByText(`Customer: ${PROFILE_ID}`, { exact: false })).toBeVisible();
  await expect(page.getByText('State: ACTIVE')).toBeVisible();
});

test('customer portal lists own addresses on the addresses section', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'GET' && path === '/customer/addresses') {
      await route.fulfill(ok({ addresses }));
      return;
    }
    if (request.method() === 'GET' && path === '/customer/profile') {
      await route.fulfill(ok({ profile }));
      return;
    }
    await route.fulfill(ok({}));
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Addresses' }).click();
  await expect(page.getByText(/Ada Lovelace — 1 Analytical Way, London/)).toBeVisible();
  await expect(page.getByText(/default shipping/)).toBeVisible();
});

test('customer portal renders the generic access-denied state on 403', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'GET' && path === '/customer/profile') {
      await route.fulfill(error(403, 'AUTHORIZATION_DENIED'));
      return;
    }
    await route.fulfill(ok({}));
  });

  await page.goto('/');
  await expect(page.getByText('You do not have permission to perform this action.')).toBeVisible();
});

test('admin portal lists customers and shows the lifecycle/audit detail', async ({ page }) => {
  await mockAdminCustomerApi(page);
  await page.goto('/admin');

  await page.getByRole('button', { name: 'Customers' }).click();
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await expect(page.getByText(PROFILE_ID, { exact: false })).toBeVisible();

  // Open the customer detail: audit trail + lifecycle actions are server data.
  await page.getByRole('button', { name: new RegExp(PROFILE_ID) }).click();
  await expect(page.getByRole('heading', { name: 'Customer detail' })).toBeVisible();
  await expect(page.getByText('State: ACTIVE')).toBeVisible();
  await expect(page.getByText(/CUSTOMER_PROFILE_CREATED/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible();
});

test('admin portal applies a lifecycle action with the mandatory reason', async ({ page }) => {
  await mockAdminCustomerApi(page);
  await page.goto('/admin');

  await page.getByRole('button', { name: 'Customers' }).click();
  await page.getByRole('button', { name: new RegExp(PROFILE_ID) }).click();
  await expect(page.getByRole('heading', { name: 'Customer detail' })).toBeVisible();

  await page.getByLabel(/Reason reference/).fill('AZR-REF-001');
  await page.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByText('Customer suspended. Version 3.')).toBeVisible();
});

test('admin customer section renders the generic access-denied state on 403', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'GET' && path === '/admin/customers') {
      await route.fulfill(error(403, 'AUTHORIZATION_DENIED'));
      return;
    }
    if (request.method() === 'GET' && path === '/admin/sellers') {
      await route.fulfill(ok({ sellers: [] }));
      return;
    }
    await route.fulfill(ok({}));
  });

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Customers' }).click();
  await expect(page.getByText('You do not have permission to perform this action.')).toBeVisible();
});

async function mockAdminCustomerApi(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'GET' && path === '/admin/customers') {
      await route.fulfill(
        ok({
          customers: [
            {
              customerProfileId: PROFILE_ID,
              state: 'ACTIVE',
              version: 2,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
      );
      return;
    }
    if (request.method() === 'GET' && path === `/admin/customers/${PROFILE_ID}`) {
      await route.fulfill(
        ok({
          customer: {
            customerProfileId: PROFILE_ID,
            identityId: '0191310f-789a-7123-8123-000000000001',
            state: 'ACTIVE',
            version: 2,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
            audit: [
              {
                auditEventId: '0191310f-789a-7123-8123-000000000006',
                eventType: 'CUSTOMER_PROFILE_CREATED',
                actorIdentityId: '0191310f-789a-7123-8123-000000000001',
                occurredAt: '2026-08-01T00:00:00.000Z',
              },
            ],
            transitions: [],
          },
        }),
      );
      return;
    }
    if (request.method() === 'POST' && path === `/admin/customers/${PROFILE_ID}/lifecycle`) {
      await route.fulfill(
        ok({
          customer: { customerProfileId: PROFILE_ID, state: 'SUSPENDED', version: 3 },
        }),
      );
      return;
    }
    if (request.method() === 'GET' && path === '/admin/sellers') {
      await route.fulfill(ok({ sellers: [] }));
      return;
    }
    await route.fulfill(ok({}));
  });
}
