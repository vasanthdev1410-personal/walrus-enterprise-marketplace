'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { PaymentApiClient } from '@/src/lib/payment-api';

interface PaymentApiProviderProps {
  readonly children: ReactNode;
  readonly client?: PaymentApiClient;
}

const PaymentApiContext = createContext<PaymentApiClient | null>(null);

/**
 * Provides the M09-M5 payment API client to the customer/admin UI.
 * Mirrors the OrderApiProvider pattern.
 */
export function PaymentApiProvider({ children, client }: PaymentApiProviderProps): ReactNode {
  const value = useMemo<PaymentApiClient>(() => client ?? createDefaultPaymentClient(), [client]);
  return <PaymentApiContext.Provider value={value}>{children}</PaymentApiContext.Provider>;
}

export function usePaymentApi(): PaymentApiClient {
  const client = useContext(PaymentApiContext);
  if (client === null) {
    throw new Error('usePaymentApi must be used within a PaymentApiProvider');
  }
  return client;
}

export function createDefaultPaymentClient(): PaymentApiClient {
  return new PaymentApiClient({
    baseUrl: resolvePublicPaymentApiBaseUrl(),
    getAccessToken: () => paymentAccessToken,
  });
}

export function resolvePublicPaymentApiBaseUrl(): string {
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

let paymentAccessToken: string | null = null;

export function setPaymentAccessToken(token: string | null): void {
  paymentAccessToken = token;
}
