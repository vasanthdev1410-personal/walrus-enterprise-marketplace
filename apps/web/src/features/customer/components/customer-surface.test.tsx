import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CustomerApiClient } from '@/src/lib/customer-api';
import { CustomerApiProvider } from '../customer-api-provider';
import { CustomerSelfServicePanel } from './customer-surface';

const PROFILE_ID = '0191310f-789a-7123-8123-000000000003';
const ADDRESS_ID = '0191310f-789a-7123-8123-000000000004';

function renderPanel(
  panel: ReactNode,
  load: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof render> {
  const client = new CustomerApiClient({
    baseUrl: 'http://api.test',
    getAccessToken: () => 'token',
    fetchImpl: vi.fn().mockImplementation(load) as typeof fetch,
  });
  return render(<CustomerApiProvider client={client}>{panel}</CustomerApiProvider>);
}

const ok = (data: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify({ data, correlationId: 'c1' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const profileResponse = (): Response =>
  ok({
    profile: {
      customerProfileId: PROFILE_ID,
      state: 'ACTIVE',
      version: 2,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  });

const addressesResponse = (): Response =>
  ok({
    addresses: [
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
    ],
  });

describe('CustomerSelfServicePanel (M06-M5)', () => {
  it('renders the own profile state from the server', async () => {
    renderPanel(<CustomerSelfServicePanel />, (url) => {
      if (url.endsWith('/customer/profile')) return profileResponse();
      return ok({});
    });

    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(
      await screen.findByText(/Customer: 0191310f-789a-7123-8123-000000000003/),
    ).toBeInTheDocument();
    expect(screen.getByText('State: ACTIVE')).toBeInTheDocument();
  });

  it('lists own addresses on the addresses section', async () => {
    renderPanel(<CustomerSelfServicePanel />, (url) => {
      if (url.endsWith('/customer/addresses')) return addressesResponse();
      if (url.endsWith('/customer/profile')) return profileResponse();
      return ok({});
    });

    fireEvent.click(screen.getByRole('button', { name: 'Addresses' }));
    expect(await screen.findByText(/Ada Lovelace — 1 Analytical Way, London/)).toBeInTheDocument();
    expect(screen.getByText(/default shipping/)).toBeInTheDocument();
  });

  it('shows the optional business profile form when none is attached (404)', async () => {
    renderPanel(<CustomerSelfServicePanel />, (url) => {
      if (url.endsWith('/customer/profile')) return profileResponse();
      if (url.endsWith('/customer/business')) return ok({}, 404);
      return ok({});
    });

    fireEvent.click(screen.getByRole('button', { name: 'Business profile' }));
    expect(await screen.findByText('Create business profile')).toBeInTheDocument();
  });

  it('shows the attached business profile facts', async () => {
    renderPanel(<CustomerSelfServicePanel />, (url) => {
      if (url.endsWith('/customer/profile')) return profileResponse();
      if (url.endsWith('/customer/business')) {
        return ok({
          business: {
            customerBusinessProfileId: '0191310f-789a-7123-8123-000000000005',
            companyName: 'Analytical Engines Ltd',
            businessType: 'Manufacturer',
          },
        });
      }
      return ok({});
    });

    fireEvent.click(screen.getByRole('button', { name: 'Business profile' }));
    expect(await screen.findByText(/Company: Analytical Engines Ltd/)).toBeInTheDocument();
  });

  it('lists own preferences', async () => {
    renderPanel(<CustomerSelfServicePanel />, (url) => {
      if (url.endsWith('/customer/profile')) return profileResponse();
      if (url.endsWith('/customer/preferences')) {
        return ok({
          preferences: [
            { preferenceId: 'x1', preferenceKey: 'language', preferenceValue: 'en' },
            { preferenceId: 'x2', preferenceKey: 'currency', preferenceValue: 'USD' },
          ],
        });
      }
      return ok({});
    });

    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }));
    expect(await screen.findByText('Language: en')).toBeInTheDocument();
    expect(screen.getByText('Currency: USD')).toBeInTheDocument();
  });

  it('renders the generic access-denied state when the server denies', async () => {
    renderPanel(<CustomerSelfServicePanel />, (url) => {
      if (url.endsWith('/customer/profile')) return ok({}, 403);
      return ok({});
    });

    expect(
      await screen.findByText('You do not have permission to perform this action.'),
    ).toBeInTheDocument();
  });
});
