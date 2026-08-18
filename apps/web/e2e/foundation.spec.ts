import { expect, test } from '@playwright/test';

test('serves the web foundation and health endpoint', async ({ page, request }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ service: 'web', status: 'UP' });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Customer portal' })).toBeVisible();
});
