import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultClient,
  resolvePublicApiBaseUrl,
  setAccessToken,
} from './seller-api-provider';

describe('SellerApiProvider helpers', () => {
  it('creates a default client without a session token', () => {
    setAccessToken(null);
    const client = createDefaultClient();
    expect(client).toBeInstanceOf(Object);
  });

  it('stores and clears the in-memory access token', () => {
    setAccessToken('token-123');
    setAccessToken(null);
    expect(createDefaultClient()).toBeInstanceOf(Object);
  });

  describe('resolvePublicApiBaseUrl', () => {
    it('defaults to the same-origin proxy when the env var is unset', () => {
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', undefined);
      expect(resolvePublicApiBaseUrl()).toBe('/api/v1');
    });

    it('accepts a relative base URL', () => {
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '/api/v2');
      expect(resolvePublicApiBaseUrl()).toBe('/api/v2');
    });

    it('rejects a cross-origin base URL and falls back to the same-origin proxy', () => {
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.example.test/api/v1');
      expect(resolvePublicApiBaseUrl()).toBe('/api/v1');
    });

    it('accepts an absolute base URL that matches the web origin', () => {
      const origin = window.location.origin;
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `${origin}/api/v1`);
      expect(resolvePublicApiBaseUrl()).toBe(`${origin}/api/v1`);
    });
  });
});
