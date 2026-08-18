import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CustomerApiClient } from '@/src/lib/customer-api';
import { CustomerApiProvider } from '../../customer/customer-api-provider';
import {
  AdminCustomerAudit,
  AdminCustomerDetail,
  AdminCustomerList,
} from './admin-customer-surface';

const CUSTOMER_ID = '0191310f-789a-7123-8123-000000000003';
const AUDIT_ID = '0191310f-789a-7123-8123-000000000006';

function renderSurface(
  surface: React.ReactNode,
  load: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof render> {
  const client = new CustomerApiClient({
    baseUrl: 'http://api.test',
    getAccessToken: () => 'token',
    fetchImpl: vi.fn().mockImplementation(load) as typeof fetch,
  });
  return render(<CustomerApiProvider client={client}>{surface}</CustomerApiProvider>);
}

const ok = (data: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify({ data, correlationId: 'c1' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const listResponse = (): Response =>
  ok({
    customers: [
      {
        customerProfileId: CUSTOMER_ID,
        state: 'ACTIVE',
        version: 2,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
  });

const detailResponse = (): Response =>
  ok({
    customer: {
      customerProfileId: CUSTOMER_ID,
      identityId: '0191310f-789a-7123-8123-000000000001',
      state: 'ACTIVE',
      version: 2,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      audit: [
        {
          auditEventId: AUDIT_ID,
          eventType: 'CUSTOMER_PROFILE_CREATED',
          actorIdentityId: '0191310f-789a-7123-8123-000000000001',
          occurredAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      transitions: [],
    },
  });

const auditResponse = (): Response =>
  ok({
    audit: [
      {
        auditEventId: AUDIT_ID,
        eventType: 'CUSTOMER_STATE_TRANSITIONED',
        actorIdentityId: '0191310f-789a-7123-8123-000000000001',
        occurredAt: '2026-08-01T00:00:00.000Z',
      },
    ],
  });

describe('AdminCustomerList (M06-M5)', () => {
  it('renders the non-enumerating customer list from the server', async () => {
    const onSelect = vi.fn();
    renderSurface(<AdminCustomerList onSelect={onSelect} />, (url) => {
      if (url.endsWith('/admin/customers')) return listResponse();
      return ok({});
    });

    expect(await screen.findByText('Customers')).toBeInTheDocument();
    expect(await screen.findByText(/0191310f-789a-7123-8123-000000000003/)).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('renders the empty state when there are no profiles', async () => {
    renderSurface(<AdminCustomerList onSelect={vi.fn()} />, (url) => {
      if (url.endsWith('/admin/customers')) return ok({ customers: [] });
      return ok({});
    });

    expect(await screen.findByText('No customer profiles found.')).toBeInTheDocument();
  });

  it('navigates to the detail view on selection', async () => {
    const onSelect = vi.fn();
    renderSurface(<AdminCustomerList onSelect={onSelect} />, (url) => {
      if (url.endsWith('/admin/customers')) return listResponse();
      return ok({});
    });

    fireEvent.click(
      await screen.findByRole('button', { name: /0191310f-789a-7123-8123-000000000003/ }),
    );
    expect(onSelect).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it('renders the generic access-denied state when the server denies', async () => {
    renderSurface(<AdminCustomerList onSelect={vi.fn()} />, (url) => {
      if (url.endsWith('/admin/customers')) return ok({}, 403);
      return ok({});
    });

    expect(
      await screen.findByText('You do not have permission to perform this action.'),
    ).toBeInTheDocument();
  });
});

describe('AdminCustomerDetail (M06-M5)', () => {
  it('renders detail facts and the append-only audit trail', async () => {
    renderSurface(
      <AdminCustomerDetail customerProfileId={CUSTOMER_ID} onBack={vi.fn()} />,
      (url) => {
        if (url.endsWith(`/admin/customers/${CUSTOMER_ID}`)) return detailResponse();
        return ok({});
      },
    );

    expect(await screen.findByText('Customer detail')).toBeInTheDocument();
    expect(await screen.findByText('State: ACTIVE')).toBeInTheDocument();
    expect(await screen.findByText(/CUSTOMER_PROFILE_CREATED/)).toBeInTheDocument();
  });

  it('requires a reason reference before sending a lifecycle action', async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith(`/admin/customers/${CUSTOMER_ID}`)) return detailResponse();
      return ok({});
    });
    const client = new CustomerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'token',
      fetchImpl: fetchImpl as typeof fetch,
    });
    render(
      <CustomerApiProvider client={client}>
        <AdminCustomerDetail customerProfileId={CUSTOMER_ID} onBack={vi.fn()} />
      </CustomerApiProvider>,
    );

    await screen.findByText('Customer detail');
    const lifecycleUrl = `http://api.test/admin/customers/${CUSTOMER_ID}/lifecycle`;

    // No reason entered: the client must NOT call the lifecycle endpoint.
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() => {
      expect(fetchImpl.mock.calls.some(([url]) => String(url) === lifecycleUrl)).toBe(false);
    });
  });

  it('sends the SUSPEND lifecycle action with the reason and version', async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith(`/admin/customers/${CUSTOMER_ID}`)) return detailResponse();
      if (url.endsWith('/lifecycle')) {
        return ok({
          customer: { customerProfileId: CUSTOMER_ID, state: 'SUSPENDED', version: 3 },
        });
      }
      return ok({});
    });
    const client = new CustomerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'token',
      fetchImpl: fetchImpl as typeof fetch,
    });
    render(
      <CustomerApiProvider client={client}>
        <AdminCustomerDetail customerProfileId={CUSTOMER_ID} onBack={vi.fn()} />
      </CustomerApiProvider>,
    );

    await screen.findByText('Customer detail');
    fireEvent.change(screen.getByLabelText(/Reason reference/), {
      target: { value: 'AZR-REF-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

    await waitFor(() => {
      const call = fetchImpl.mock.calls.find(([url]) => String(url).endsWith('/lifecycle'));
      expect(call).toBeDefined();
    });
    const [, init] = fetchImpl.mock.calls.find(([url]) => String(url).endsWith('/lifecycle')) as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as {
      action: string;
      reasonReference: string;
      expectedVersion: number;
    };
    expect(body.action).toBe('SUSPEND');
    expect(body.reasonReference).toBe('AZR-REF-001');
    expect(body.expectedVersion).toBe(2);
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('calls onBack from the detail view', async () => {
    const onBack = vi.fn();
    renderSurface(
      <AdminCustomerDetail customerProfileId={CUSTOMER_ID} onBack={onBack} />,
      (url) => {
        if (url.endsWith(`/admin/customers/${CUSTOMER_ID}`)) return detailResponse();
        return ok({});
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Back to customer list' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('AdminCustomerAudit (M06-M5)', () => {
  it('renders the standalone audit trail', async () => {
    renderSurface(<AdminCustomerAudit customerProfileId={CUSTOMER_ID} />, (url) => {
      if (url.endsWith(`/admin/customers/${CUSTOMER_ID}/audit`)) return auditResponse();
      return ok({});
    });

    expect(await screen.findByText('Customer audit trail')).toBeInTheDocument();
    expect(await screen.findByText(/CUSTOMER_STATE_TRANSITIONED/)).toBeInTheDocument();
  });

  it('renders the empty state when no audit events exist', async () => {
    renderSurface(<AdminCustomerAudit customerProfileId={CUSTOMER_ID} />, (url) => {
      if (url.endsWith(`/admin/customers/${CUSTOMER_ID}/audit`)) return ok({ audit: [] });
      return ok({});
    });

    expect(await screen.findByText('No audit events.')).toBeInTheDocument();
  });
});
