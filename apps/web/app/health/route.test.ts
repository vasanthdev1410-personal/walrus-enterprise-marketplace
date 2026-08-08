import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from './route';

describe('web health route', () => {
  beforeEach(() => {
    delete process.env.APP_VERSION;
  });

  afterEach(() => {
    delete process.env.APP_VERSION;
  });

  it('reports the web process as up', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'UP', service: 'web' });
  });

  it('includes the configured APP_VERSION when set', async () => {
    process.env.APP_VERSION = '9.9.9';
    const response = GET();
    await expect(response.json()).resolves.toMatchObject({ version: '9.9.9' });
  });
});
