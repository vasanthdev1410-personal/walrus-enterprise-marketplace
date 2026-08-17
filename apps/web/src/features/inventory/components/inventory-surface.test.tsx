import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SellerApiClient } from '@/src/lib/seller-api';
import { SellerApiProvider } from '../../seller/seller-api-provider';
import { InventoryPanel } from './inventory-surface';

const SELLER_ID = '0191310f-789a-7123-8123-000000000003';
const SKU_ID = '0191310f-789a-7123-8123-000000000007';

function renderPanel(
  panel: ReactNode,
  load: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof render> {
  const client = new SellerApiClient({
    baseUrl: 'http://api.test',
    getAccessToken: () => 'token',
    fetchImpl: vi.fn().mockImplementation(load) as typeof fetch,
  });
  return render(<SellerApiProvider client={client}>{panel}</SellerApiProvider>);
}

const ok = (data: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify({ data, correlationId: 'c1' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const profileResponse = (): Response =>
  ok({
    profile: {
      sellerProfileId: SELLER_ID,
      state: 'ACTIVE',
      complianceState: 'COMPLIANT',
      version: 5,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      organization: { legalName: 'Walrus Retail', tradeName: 'Walrus', businessAddress: 'A' },
      members: [],
    },
  });

const inventoryListResponse = (): Response =>
  ok({
    inventory: [
      {
        skuId: SKU_ID,
        onHand: 12,
        reserved: 2,
        available: 10,
        version: 2,
        label: 'IN_STOCK',
      },
      {
        skuId: '0191310f-789a-7123-8123-000000000008',
        onHand: 0,
        reserved: 0,
        available: 0,
        version: 1,
        label: 'OUT_OF_STOCK',
      },
    ],
  });

const skuDetailResponse = (): Response =>
  ok({
    inventory: {
      skuId: SKU_ID,
      onHand: 12,
      reserved: 2,
      available: 10,
      version: 2,
      label: 'IN_STOCK',
    },
  });

describe('InventoryPanel (seller inventory, M05-M5)', () => {
  it('lists own inventory with derived stock labels', async () => {
    renderPanel(<InventoryPanel />, (url) => {
      if (url.endsWith('/seller/profile')) return profileResponse();
      return inventoryListResponse();
    });

    expect(await screen.findByText('Inventory')).toBeInTheDocument();
    expect(await screen.findByText('In stock')).toBeInTheDocument();
    expect(await screen.findByText('Out of stock')).toBeInTheDocument();
    expect(screen.getByText(/10 available \(12 on hand, 2 reserved\)/)).toBeInTheDocument();
  });

  it('shows an empty state when no inventory records exist', async () => {
    renderPanel(<InventoryPanel />, (url) => {
      if (url.endsWith('/seller/profile')) return profileResponse();
      return ok({ inventory: [] });
    });

    expect(await screen.findByText('No inventory records yet.')).toBeInTheDocument();
  });

  it('opens the SKU detail with the movement ledger on selection', async () => {
    renderPanel(<InventoryPanel />, (url) => {
      if (url.endsWith('/seller/profile')) return profileResponse();
      if (url.includes('/movements')) {
        return ok({
          movements: [
            {
              movementId: '0191310f-789a-7123-8123-000000000010',
              movementType: 'STOCK_IN',
              delta: 12,
              resultingOnHand: 12,
              resultingReserved: 0,
              actorIdentityId: '0191310f-789a-7123-8123-000000000001',
              occurredAt: '2026-08-10T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes(`/seller/inventory/${SKU_ID}`)) return skuDetailResponse();
      return inventoryListResponse();
    });

    fireEvent.click(await screen.findByText(SKU_ID));
    expect(await screen.findByText('SKU inventory')).toBeInTheDocument();
    expect(await screen.findByText(/STOCK_IN \+12/)).toBeInTheDocument();
  });

  it('performs a stock-in adjustment and confirms the new availability', async () => {
    renderPanel(<InventoryPanel />, (url, init) => {
      if (url.endsWith('/seller/profile')) return profileResponse();
      if (url.includes('/movements') && init?.method === 'POST') {
        return ok({
          inventory: {
            skuId: SKU_ID,
            onHand: 17,
            reserved: 2,
            available: 15,
            version: 3,
          },
        });
      }
      if (url.includes('/movements')) {
        return ok({ movements: [] });
      }
      if (url.includes(`/seller/inventory/${SKU_ID}`)) return skuDetailResponse();
      return inventoryListResponse();
    });

    fireEvent.click(await screen.findByText(SKU_ID));
    fireEvent.click(await screen.findByText('Adjust stock'));
    const deltaInput = screen.getByLabelText(/Delta/);
    fireEvent.change(deltaInput, { target: { value: '5' } });
    fireEvent.click(screen.getByText('Apply adjustment'));

    expect(await screen.findByText(/Adjustment applied — 15 available now/)).toBeInTheDocument();
  });

  it('requires a reason reference for STOCK_OUT adjustments', async () => {
    renderPanel(<InventoryPanel />, (url) => {
      if (url.endsWith('/seller/profile')) return profileResponse();
      if (url.includes('/movements')) {
        return ok({ movements: [] });
      }
      if (url.includes(`/seller/inventory/${SKU_ID}`)) return skuDetailResponse();
      return inventoryListResponse();
    });

    fireEvent.click(await screen.findByText(SKU_ID));
    fireEvent.click(await screen.findByText('Adjust stock'));
    fireEvent.change(screen.getByLabelText(/Movement type/), {
      target: { value: 'STOCK_OUT' },
    });
    expect(await screen.findByText('Reason reference (required)')).toBeInTheDocument();
  });

  it('surfaces a generic access-denied state for cross-organization SKUs', async () => {
    renderPanel(<InventoryPanel />, (url) => {
      if (url.endsWith('/seller/profile')) return profileResponse();
      if (url.includes('/movements')) {
        return ok({ movements: [] });
      }
      if (url.includes(`/seller/inventory/${SKU_ID}`)) {
        return new Response(JSON.stringify({ success: false, message: 'AUTHORIZATION_DENIED' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return inventoryListResponse();
    });

    fireEvent.click(await screen.findByText(SKU_ID));
    expect(
      await screen.findByText('You do not have permission to perform this action.'),
    ).toBeInTheDocument();
  });
});
