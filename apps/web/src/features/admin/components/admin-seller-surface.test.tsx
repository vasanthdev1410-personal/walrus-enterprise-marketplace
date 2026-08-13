import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SellerApiClient } from '@/src/lib/seller-api';
import { SellerApiProvider } from '../../seller/seller-api-provider';
import { AdminSellerDetail } from './admin-seller-surface';
import { AdminSellerList } from './admin-seller-surface';

function renderPanel(panel: ReactNode, load: () => Response): ReturnType<typeof render> {
  const client = new SellerApiClient({
    baseUrl: 'http://api.test',
    getAccessToken: () => 'token',
    fetchImpl: vi.fn().mockImplementation(load) as typeof fetch,
  });
  return render(<SellerApiProvider client={client}>{panel}</SellerApiProvider>);
}

const ok = (data: Record<string, unknown>): Response =>
  new Response(JSON.stringify({ data, correlationId: 'c1' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('AdminSellerList', () => {
  it('renders seller summary rows without evidence or registration data', async () => {
    const onSelect = vi.fn();
    renderPanel(<AdminSellerList onSelect={onSelect} />, () =>
      ok({
        sellers: [
          {
            sellerProfileId: '0191310f-789a-7123-8123-000000000003',
            state: 'SUBMITTED',
            complianceState: 'IN_PROGRESS',
            version: 2,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(
      (await screen.findAllByText(/0191310f-789a-7123-8123-000000000003/)).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.queryByText(/evidence|registration|GSTIN/i)).not.toBeInTheDocument();
  });

  it('renders a non-enumerating empty state when no sellers match', async () => {
    renderPanel(<AdminSellerList onSelect={vi.fn()} />, () => ok({ sellers: [] }));
    expect(await screen.findByText('No sellers found.')).toBeInTheDocument();
  });

  it('surfaces a generic access-denied state on 403', async () => {
    renderPanel(
      <AdminSellerList onSelect={vi.fn()} />,
      () =>
        new Response(
          JSON.stringify({
            success: false,
            message: 'AUTHORIZATION_DENIED',
            errorCode: 'UNEXPECTED_ERROR',
            errors: [],
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    expect(
      await screen.findByText('You do not have permission to perform this action.'),
    ).toBeInTheDocument();
  });
});

describe('AdminSellerDetail', () => {
  const detail = {
    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
    state: 'SUBMITTED',
    complianceState: 'IN_PROGRESS',
    version: 2,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    organization: {
      legalName: 'Walrus Retail',
      tradeName: 'Walrus',
      businessAddress: '1 Market Street',
    },
    members: [],
  };

  it('renders the detail with review actions and evidence metadata', async () => {
    const client = new SellerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'token',
      fetchImpl: vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('/evidence')
            ? ok({
                evidence: [
                  {
                    verificationId: '0191310f-789a-7123-8123-000000000004',
                    verificationType: 'GST',
                    verificationState: 'SUBMITTED',
                    generation: 1,
                    evidenceId: '0191310f-789a-7123-8123-000000000008',
                    evidenceType: 'GST_CERTIFICATE',
                    evidenceReference: 'ref:object:opaque',
                    evidenceDigest: 'a'.repeat(64),
                    uploadedByIdentityId: '0191310f-789a-7123-8123-000000000001',
                    uploadedAt: '2026-08-01T00:00:00.000Z',
                  },
                ],
              })
            : ok({ seller: detail }),
        ),
      ) as typeof fetch,
    });
    render(
      <SellerApiProvider client={client}>
        <AdminSellerDetail sellerProfileId={detail.sellerProfileId} />
      </SellerApiProvider>,
    );
    expect(await screen.findByRole('heading', { name: /Seller 0191310f/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    // Evidence metadata only — never the raw reference.
    expect(await screen.findByText(/GST_CERTIFICATE/)).toBeInTheDocument();
    expect(screen.queryByText(/ref:object:opaque/)).not.toBeInTheDocument();
  });

  it('shows a validation notice when a reason is missing for REJECT', async () => {
    renderPanel(<AdminSellerDetail sellerProfileId={detail.sellerProfileId} />, () =>
      ok({ seller: detail, evidence: [] }),
    );
    await screen.findByRole('button', { name: 'Reject' });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(
      await screen.findByText(
        'The request could not be completed. Check the entered details and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a safe conflict notice when a review decision fails server-side', async () => {
    const client = new SellerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'token',
      fetchImpl: vi.fn().mockImplementation((url: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === 'POST'
            ? new Response(
                JSON.stringify({
                  success: false,
                  message: 'SELLER_STATE_CONFLICT',
                  errorCode: 'UNEXPECTED_ERROR',
                  errors: [],
                }),
                { status: 409, headers: { 'Content-Type': 'application/json' } },
              )
            : new Response(
                JSON.stringify({
                  data: {
                    ...(url.includes('/evidence') ? { evidence: [] } : { seller: detail }),
                  },
                  correlationId: 'c1',
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
              ),
        ),
      ) as typeof fetch,
    });
    render(
      <SellerApiProvider client={client}>
        <AdminSellerDetail sellerProfileId={detail.sellerProfileId} />
      </SellerApiProvider>,
    );
    await screen.findByRole('button', { name: 'Approve' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(
      await screen.findByText(
        'This action conflicts with the current state. Refresh and try again.',
      ),
    ).toBeInTheDocument();
  });
});
