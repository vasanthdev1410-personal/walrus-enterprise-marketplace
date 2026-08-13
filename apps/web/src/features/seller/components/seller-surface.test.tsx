import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SellerApiClient } from '@/src/lib/seller-api';
import { SellerApiProvider } from '../seller-api-provider';
import { AgreementsPanel } from './seller-surface';
import { BusinessPanel } from './seller-surface';
import { MembersPanel } from './seller-surface';
import { ProfilePanel } from './seller-surface';
import { VerificationPanel } from './seller-surface';
import { WarehousesPanel } from './seller-surface';

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

describe('VerificationPanel (evidence privacy)', () => {
  it('renders verification states without any evidence references or digests', async () => {
    renderPanel(<VerificationPanel />, () =>
      ok({
        verification: {
          sellerProfileId: '0191310f-789a-7123-8123-000000000003',
          complianceState: 'IN_PROGRESS',
          verifications: [{ verificationType: 'GST', state: 'SUBMITTED', generation: 1 }],
        },
      }),
    );
    expect(await screen.findByText('GST: SUBMITTED')).toBeInTheDocument();
    expect(
      screen.queryByText(/evidenceReference|evidenceDigest|ref:object/i),
    ).not.toBeInTheDocument();
  });

  it('shows an empty state when no verification records exist', async () => {
    renderPanel(<VerificationPanel />, () =>
      ok({
        verification: {
          sellerProfileId: '0191310f-789a-7123-8123-000000000003',
          complianceState: 'NOT_STARTED',
          verifications: [],
        },
      }),
    );
    expect(await screen.findByText('No verification records yet.')).toBeInTheDocument();
  });
});

describe('AgreementsPanel (D-05 record display only)', () => {
  it('renders agreement record fields but never rates or terms', async () => {
    renderPanel(<AgreementsPanel />, () =>
      ok({
        agreements: [
          {
            agreementId: '0191310f-789a-7123-8123-000000000007',
            agreementType: 'COMMISSION',
            reference: 'cmv:commission/2026/001',
            state: 'ACTIVE',
            effectiveFrom: '2026-01-01T00:00:00.000Z',
            effectiveTo: '2026-12-31T00:00:00.000Z',
            signedAt: '2026-01-15T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(await screen.findByText('COMMISSION')).toBeInTheDocument();
    expect(screen.getByText(/Reference: cmv:commission\/2026\/001/)).toBeInTheDocument();
    // Record fields only — no financial terms are ever rendered for the row.
    const row = screen.getByText('COMMISSION').closest('li');
    expect(row?.textContent).not.toMatch(/%|slab|payout|rate|percentage/i);
  });

  it('shows an empty state when no agreements exist', async () => {
    renderPanel(<AgreementsPanel />, () => ok({ agreements: [] }));
    expect(await screen.findByText('No agreements yet.')).toBeInTheDocument();
  });
});

describe('ProfilePanel', () => {
  it('renders the own profile without registration numbers', async () => {
    renderPanel(<ProfilePanel />, () =>
      ok({
        profile: {
          sellerProfileId: '0191310f-789a-7123-8123-000000000003',
          state: 'ACTIVE',
          complianceState: 'COMPLIANT',
          version: 5,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          organization: {
            legalName: 'Walrus Retail',
            tradeName: 'Walrus',
            businessAddress: 'Addr',
          },
          members: [],
        },
      }),
    );
    expect(await screen.findByText('Seller profile')).toBeInTheDocument();
    expect(screen.queryByText(/registration|GSTIN|PAN/i)).not.toBeInTheDocument();
  });
});

describe('WarehousesPanel', () => {
  it('lists warehouses', async () => {
    renderPanel(<WarehousesPanel />, () =>
      ok({
        warehouses: [
          {
            warehouseId: '0191310f-789a-7123-8123-000000000005',
            name: 'Main',
            state: 'ACTIVE',
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(await screen.findByText(/Main — ACTIVE/)).toBeInTheDocument();
  });
});

describe('MembersPanel', () => {
  it('shows owner and member roles without PII', async () => {
    renderPanel(<MembersPanel />, () =>
      ok({
        members: [
          {
            identityId: '0191310f-789a-7123-8123-000000000001',
            associationRole: 'OWNER',
            isPrimary: true,
            state: 'ACTIVE',
            addedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(await screen.findByText(/Owner — 0191310f/)).toBeInTheDocument();
  });
});

describe('shared async states', () => {
  it('renders a generic server error without internal codes', async () => {
    renderPanel(
      <ProfilePanel />,
      () =>
        new Response(
          JSON.stringify({
            success: false,
            message: 'An unexpected error occurred.',
            errorCode: 'UNEXPECTED_ERROR',
            errors: [],
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    expect(
      await screen.findByText('An unexpected error occurred. Please try again shortly.'),
    ).toBeInTheDocument();
  });

  it('renders a safe validation message on 400', async () => {
    renderPanel(
      <BusinessPanel />,
      () =>
        new Response(
          JSON.stringify({
            success: false,
            message: 'SELLER_PRECONDITION_FAILED',
            errorCode: 'VALIDATION_ERROR',
            errors: [],
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    expect(
      await screen.findByText(
        'The request could not be completed. Check the entered details and try again.',
      ),
    ).toBeInTheDocument();
  });
});

describe('AsyncBoundary empty callback (present data)', () => {
  it('renders the data children when the empty callback returns null', async () => {
    const { AsyncBoundary } = await import('./async');
    render(
      <AsyncBoundary state={{ status: 'ready', data: [1] }} empty={() => null}>
        {(data) => <p>{String(data.length)} items</p>}
      </AsyncBoundary>,
    );
    expect(screen.getByText('1 items')).toBeInTheDocument();
  });
});

describe('WarehousesPanel create flow', () => {
  it('creates a warehouse through the add form', async () => {
    const client = new SellerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'token',
      fetchImpl: vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({ data: { warehouse: { state: 'ACTIVE' } }, correlationId: 'c1' }),
              {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          );
        }
        if (url.includes('/profile')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: {
                  profile: {
                    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
                    state: 'ACTIVE',
                    complianceState: 'COMPLIANT',
                    version: 5,
                    createdAt: '2026-08-01T00:00:00.000Z',
                    updatedAt: '2026-08-01T00:00:00.000Z',
                    organization: { legalName: 'L', tradeName: 'T', businessAddress: 'A' },
                    members: [],
                  },
                },
                correlationId: 'c1',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ data: { warehouses: [] }, correlationId: 'c1' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }) as typeof fetch,
    });
    render(
      <SellerApiProvider client={client}>
        <WarehousesPanel />
      </SellerApiProvider>,
    );
    await screen.findByText('Warehouses');
    fireEvent.click(screen.getByRole('button', { name: 'Add warehouse' }));
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Main' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'Sector 62' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create warehouse' }));
    expect(await screen.findByText('Warehouse created.')).toBeInTheDocument();
  });
});

describe('MembersPanel add flow', () => {
  it('adds a member through the add form', async () => {
    const client = new SellerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'token',
      fetchImpl: vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: { member: { associationState: 'ACTIVE' } },
                correlationId: 'c1',
              }),
              {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          );
        }
        if (url.includes('/profile')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: {
                  profile: {
                    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
                    state: 'ACTIVE',
                    complianceState: 'COMPLIANT',
                    version: 5,
                    createdAt: '2026-08-01T00:00:00.000Z',
                    updatedAt: '2026-08-01T00:00:00.000Z',
                    organization: { legalName: 'L', tradeName: 'T', businessAddress: 'A' },
                    members: [],
                  },
                },
                correlationId: 'c1',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ data: { members: [] }, correlationId: 'c1' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }) as typeof fetch,
    });
    render(
      <SellerApiProvider client={client}>
        <MembersPanel />
      </SellerApiProvider>,
    );
    await screen.findByText('Members');
    fireEvent.change(screen.getByLabelText('Member identity ID'), {
      target: { value: '0191310f-789a-7123-8123-000000000006' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    expect(await screen.findByText('Member added.')).toBeInTheDocument();
  });
});

describe('BusinessPanel edit flow', () => {
  it('saves business information through the edit form', async () => {
    const patched: { init?: RequestInit }[] = [];
    const client = new SellerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'token',
      fetchImpl: vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          patched.push({ init });
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: { seller: { state: 'DRAFT', version: 2 } },
                correlationId: 'c1',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          );
        }
        if (url.includes('/profile')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: {
                  profile: {
                    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
                    state: 'DRAFT',
                    complianceState: 'NOT_STARTED',
                    version: 1,
                    createdAt: '2026-08-01T00:00:00.000Z',
                    updatedAt: '2026-08-01T00:00:00.000Z',
                    organization: { legalName: 'L', tradeName: 'T', businessAddress: 'A' },
                    members: [],
                  },
                },
                correlationId: 'c1',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                business: { version: 1, legalName: 'L', tradeName: 'T', businessAddress: 'A' },
              },
              correlationId: 'c1',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }) as typeof fetch,
    });
    render(
      <SellerApiProvider client={client}>
        <BusinessPanel />
      </SellerApiProvider>,
    );
    await screen.findByText('Business information');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('button', { name: 'Save changes' });
    fireEvent.change(screen.getByLabelText('Trade name'), { target: { value: 'Walrus New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(patched.length).toBe(1);
    expect(patched[0]?.init?.body).toContain('Walrus New');
  });
});
