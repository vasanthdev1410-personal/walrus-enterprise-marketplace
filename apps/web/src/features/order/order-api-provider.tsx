'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { OrderApiClient } from '@/src/lib/order-api';

interface OrderApiProviderProps {
  readonly children: ReactNode;
  /** Injectable client (tests/E2E override the base URL/token provider). */
  readonly client?: OrderApiClient;
}

const OrderApiContext = createContext<OrderApiClient | null>(null);

/**
 * Provides the M08-M5 order API client to the customer/admin UI. The client
 * is created once against the same-origin `/api/v1` proxy (see
 * next.config.ts), mirroring the cart API provider.
 *
 * Token handling follows the safe web pattern: the access token is held in
 * memory only (never localStorage/sessionStorage) and is populated by the
 * Module 01 web authentication flow. Until a session exists, `getAccessToken`
 * returns null, requests are sent unauthenticated, the server returns 401, and
 * the UI renders the generic session-expired state. The UI never decides
 * access — the server remains authoritative (A-08).
 */
export function OrderApiProvider({ children, client }: OrderApiProviderProps): ReactNode {
  const value = useMemo<OrderApiClient>(() => client ?? createDefaultOrderClient(), [client]);
  return <OrderApiContext.Provider value={value}>{children}</OrderApiContext.Provider>;
}

export function useOrderApi(): OrderApiClient {
  const client = useContext(OrderApiContext);
  if (client === null) {
    throw new Error('useOrderApi must be used within an OrderApiProvider');
  }
  return client;
}

export function createDefaultOrderClient(): OrderApiClient {
  return new OrderApiClient({
    baseUrl: resolvePublicOrderApiBaseUrl(),
    getAccessToken: () => orderAccessToken,
  });
}

/**
 * Resolves the client base URL for the same-origin `/api/v1` proxy (see
 * next.config.ts). The CSP (`connect-src 'self'`) forbids cross-origin
 * fetches, so an absolute `NEXT_PUBLIC_API_BASE_URL` is honored only when
 * it points at the web origin itself; anything else falls back to `/api/v1`.
 */
export function resolvePublicOrderApiBaseUrl(): string {
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
 * In-memory access-token holder, shared with the customer/cart providers
 * so all surface sets authenticate through the same Module 01 session.
 */
let orderAccessToken: string | null = null;

export function setOrderAccessToken(token: string | null): void {
  orderAccessToken = token;
}
