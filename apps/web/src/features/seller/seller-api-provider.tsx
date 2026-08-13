'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { SellerApiClient } from '@/src/lib/seller-api';

interface SellerApiProviderProps {
  readonly children: ReactNode;
  /** Injectable client (tests/E2E override the base URL/token provider). */
  readonly client?: SellerApiClient;
}

const SellerApiContext = createContext<SellerApiClient | null>(null);

/**
 * Provides the M03-M5 seller API client to the seller/admin UI. The client is
 * created once against the same-origin `/api/v1` proxy (see next.config.ts).
 *
 * Token handling follows the safe web pattern: the access token is held in
 * memory only (never localStorage/sessionStorage) and is populated by the
 * Module 01 web authentication flow. Until a session exists, `getAccessToken`
 * returns null, requests are sent unauthenticated, the server returns 401, and
 * the UI renders the generic session-expired state. The UI never decides
 * access — the server remains authoritative.
 */
export function SellerApiProvider({ children, client }: SellerApiProviderProps): ReactNode {
  const value = useMemo<SellerApiClient>(
    () => client ?? createDefaultClient(),
    [client],
  );
  return <SellerApiContext.Provider value={value}>{children}</SellerApiContext.Provider>;
}

export function useSellerApi(): SellerApiClient {
  const client = useContext(SellerApiContext);
  if (client === null) {
    throw new Error('useSellerApi must be used within a SellerApiProvider');
  }
  return client;
}

export function createDefaultClient(): SellerApiClient {
  return new SellerApiClient({
    baseUrl: resolvePublicApiBaseUrl(),
    getAccessToken: () => accessToken,
  });
}

/**
 * Resolves the client base URL for the same-origin `/api/v1` proxy (see
 * next.config.ts). The CSP (`connect-src 'self'`) forbids cross-origin
 * fetches, so an absolute `NEXT_PUBLIC_API_BASE_URL` is honored only when it
 * points at the web origin itself; anything else falls back to `/api/v1`.
 * Relative values (e.g. `/api/v1`) are always safe.
 */
export function resolvePublicApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured === undefined || configured.length === 0) return '/api/v1';
  if (configured.startsWith('/')) return configured;
  if (typeof window === 'undefined') return '/api/v1';
  try {
    const parsed = new URL(configured, window.location.origin);
    return parsed.origin === window.location.origin ? configured : '/api/v1';
  } catch {
    return '/api/v1';
  }
}

/**
 * In-memory access-token holder. The Module 01 web login flow sets this value
 * on successful authentication; there is intentionally no token persistence in
 * browser storage. `null` means "no session" → unauthenticated requests fail
 * closed with the server's generic 401.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
