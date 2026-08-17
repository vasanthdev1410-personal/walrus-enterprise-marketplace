import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SellerApiClient } from '@/src/lib/seller-api';
import { SellerApiProvider } from '../../seller/seller-api-provider';
import {
  AdminInventoryDetail,
  AdminInventoryList,
  AdminThresholdConfigPanel,
} from './admin-inventory-surface';

const SKU_ID = '0191310f-789a-7123-8123-000000000007';
const SELLER_ID = '0191310f-789a-7123-8123-000000000003';

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

const detailResponse = (): Response =>
  ok({
    inventory: {
      skuId: SKU_ID,
      sellerProfileId: SELLER_ID,
      onHand: 30,
      reserved: 0,
      available: 30,
      version: 3,
      label: 'IN_STOCK',
      audit: [
        {
          eventType: 'POOL_CORRECTED',
          actorIdentityId: 'u1',
          occurredAt: '2026-08-12T00:00:00.000Z',
        },
      ],
      movements: [
        {
          movementId: '0191310f-789a-7123-8123-000000000010',
          movementType: 'COUNT_CORRECTION',
          delta: 10,
          resultingOnHand: 30,
          resultingReserved: 0,
          actorIdentityId: 'u1',
          occurredAt: '2026-08-12T00:00:00.000Z',
        },
      ],
    },
  });

describe('AdminInventoryList (inventory.audit.view)', () => {
  it('lists stock pools with derived labels', async () => {
    renderPanel(
      <AdminInventoryList
        onSelect={() => {
          /* noop */
        }}
      />,
      () =>
        ok({
          inventory: [
            {
              skuId: SKU_ID,
              onHand: 30,
              reserved: 0,
              available: 30,
              version: 3,
              label: 'IN_STOCK',
            },
          ],
        }),
    );

    expect(await screen.findByText('Inventory')).toBeInTheDocument();
    expect(await screen.findByText('In stock')).toBeInTheDocument();
  });

  it('shows an empty state when no pools exist', async () => {
    renderPanel(
      <AdminInventoryList
        onSelect={() => {
          /* noop */
        }}
      />,
      () => ok({ inventory: [] }),
    );

    expect(await screen.findByText('No stock pools found.')).toBeInTheDocument();
  });
});

describe('AdminInventoryDetail (inventory.audit.view + adjustment)', () => {
  it('renders stock detail, movement history and audit records', async () => {
    renderPanel(
      <AdminInventoryDetail
        skuId={SKU_ID}
        onBack={() => {
          /* noop */
        }}
      />,
      () => detailResponse(),
    );

    expect(await screen.findByText('SKU inventory detail')).toBeInTheDocument();
    expect(
      await screen.findByText(/Seller: 0191310f-789a-7123-8123-000000000003/),
    ).toBeInTheDocument();
    expect(await screen.findByText('POOL_CORRECTED')).toBeInTheDocument();
    expect(await screen.findByText(/COUNT_CORRECTION \+10/)).toBeInTheDocument();
  });

  it('performs an admin correction with the mandatory reason', async () => {
    renderPanel(
      <AdminInventoryDetail
        skuId={SKU_ID}
        onBack={() => {
          /* noop */
        }}
      />,
      (url, init) => {
        if (url.endsWith('/corrections') && init?.method === 'POST') {
          return ok({
            inventory: {
              skuId: SKU_ID,
              onHand: 25,
              reserved: 0,
              available: 25,
              version: 4,
            },
          });
        }
        return detailResponse();
      },
    );

    fireEvent.click(await screen.findByText('Correct stock'));
    fireEvent.change(screen.getByLabelText(/Target on-hand/), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/Reason reference/), {
      target: { value: 'count-2026-08-15' },
    });
    fireEvent.click(screen.getByText('Apply correction'));

    expect(await screen.findByText(/Correction applied — 25 available now/)).toBeInTheDocument();
  });
});

describe('AdminThresholdConfigPanel (D-14, admin-managed)', () => {
  it('reads and renders the D-14 thresholds with the version', async () => {
    renderPanel(<AdminThresholdConfigPanel />, () =>
      ok({ config: { lowStockThreshold: 1, outOfStockThreshold: 0, version: 0 } }),
    );

    expect(await screen.findByText('Inventory thresholds')).toBeInTheDocument();
    expect(await screen.findByText('Low-stock threshold: 1')).toBeInTheDocument();
    expect(await screen.findByText('Out-of-stock threshold: 0')).toBeInTheDocument();
    expect(await screen.findByText('Version: 0')).toBeInTheDocument();
  });

  it('updates thresholds with the expected version and confirms', async () => {
    renderPanel(<AdminThresholdConfigPanel />, (url, init) => {
      if (url.endsWith('/admin/inventory-config') && init?.method === 'PATCH') {
        return ok({ config: { lowStockThreshold: 3, outOfStockThreshold: 2, version: 1 } });
      }
      return ok({ config: { lowStockThreshold: 1, outOfStockThreshold: 0, version: 0 } });
    });

    fireEvent.click(await screen.findByText('Update thresholds'));
    fireEvent.change(screen.getByLabelText(/Low-stock threshold/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Out-of-stock threshold/), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Save thresholds'));

    expect(await screen.findByText(/Thresholds updated — version 1/)).toBeInTheDocument();
  });

  it('surfaces a generic denied state when the grant is missing', async () => {
    renderPanel(
      <AdminThresholdConfigPanel />,
      () =>
        new Response(JSON.stringify({ success: false, message: 'AUTHORIZATION_DENIED' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    expect(
      await screen.findByText('You do not have permission to perform this action.'),
    ).toBeInTheDocument();
  });
});
