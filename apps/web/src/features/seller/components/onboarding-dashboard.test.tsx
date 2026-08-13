import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SellerApiClient } from '@/src/lib/seller-api';
import type { OnboardingStatus } from '@/src/lib/seller-api';
import { SellerApiProvider } from '../seller-api-provider';
import { OnboardingDashboard } from './onboarding-dashboard';

function onboardingStatus(overrides: Partial<OnboardingStatus> = {}): OnboardingStatus {
  return {
    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
    state: 'DRAFT',
    complianceState: 'NOT_STARTED',
    version: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    organization: {
      legalName: 'Walrus Retail',
      tradeName: 'Walrus',
      businessAddress: '1 Market Street',
    },
    verifications: [],
    ...overrides,
  };
}

function renderDashboard(load: () => Response | Promise<Response>): ReturnType<typeof render> {
  const client = new SellerApiClient({
    baseUrl: 'http://api.test',
    getAccessToken: () => null,
    fetchImpl: vi.fn().mockImplementation(load) as typeof fetch,
  });
  return render(
    <SellerApiProvider client={client}>
      <OnboardingDashboard />
    </SellerApiProvider>,
  );
}

describe('OnboardingDashboard', () => {
  it('shows a loading state initially', () => {
    renderDashboard(() => new Promise<Response>(() => undefined));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('offers to start onboarding when no seller exists (404)', async () => {
    renderDashboard(() =>
      new Response(JSON.stringify({ success: false, message: 'SELLER_NOT_FOUND', errorCode: 'RESOURCE_NOT_FOUND', errors: [] }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await screen.findByText('Start seller onboarding')).toBeInTheDocument();
  });

  it('renders the pre-approval editor for a DRAFT seller', async () => {
    renderDashboard(() =>
      new Response(JSON.stringify({ data: { seller: onboardingStatus() }, correlationId: 'c1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await screen.findByText('Onboarding in progress')).toBeInTheDocument();
    expect(screen.getByText('Submit for review')).toBeInTheDocument();
    expect(screen.getByText('Edit details')).toBeInTheDocument();
  });

  it('renders the under-review view for a SUBMITTED seller', async () => {
    renderDashboard(() =>
      new Response(
        JSON.stringify({
          data: { seller: onboardingStatus({ state: 'SUBMITTED', complianceState: 'IN_PROGRESS' }) },
          correlationId: 'c1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    expect(await screen.findByText('Under review')).toBeInTheDocument();
  });

  it('renders the corrections banner and resubmit action for CORRECTIONS_REQUESTED', async () => {
    renderDashboard(() =>
      new Response(
        JSON.stringify({
          data: {
            seller: onboardingStatus({
              state: 'CORRECTIONS_REQUESTED',
              complianceState: 'IN_PROGRESS',
              version: 4,
            }),
          },
          correlationId: 'c1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    expect(await screen.findByText('Resubmit for review')).toBeInTheDocument();
    expect(
      screen.getByText(/An administrator requested corrections/),
    ).toBeInTheDocument();
  });

  it('renders the suspended state without internal detail', async () => {
    renderDashboard(() =>
      new Response(
        JSON.stringify({
          data: { seller: onboardingStatus({ state: 'SUSPENDED' }) },
          correlationId: 'c1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    expect((await screen.findAllByText('Suspended')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/SELLER_|AUTHORIZATION_DENIED/)).not.toBeInTheDocument();
  });

  it('renders the rejected/closed terminal state', async () => {
    renderDashboard(() =>
      new Response(
        JSON.stringify({
          data: { seller: onboardingStatus({ state: 'REJECTED' }) },
          correlationId: 'c1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    expect(await screen.findByText('Not active')).toBeInTheDocument();
  });

  it('renders the active dashboard with section links', async () => {
    renderDashboard(() =>
      new Response(
        JSON.stringify({
          data: {
            seller: onboardingStatus({
              state: 'ACTIVE',
              complianceState: 'COMPLIANT',
              version: 5,
            }),
          },
          correlationId: 'c1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    expect(await screen.findByText('Active seller')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Verification status')).toBeInTheDocument();
  });

  it('renders the generic session-expired state on 401', async () => {
    renderDashboard(() =>
      new Response(JSON.stringify({ success: false, message: 'AUTHENTICATION_ASSURANCE_INSUFFICIENT', errorCode: 'VALIDATION_ERROR', errors: [] }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await screen.findByText('Session expired')).toBeInTheDocument();
  });

  it('renders a generic access-denied state on 403 without leaking policy', async () => {
    renderDashboard(() =>
      new Response(JSON.stringify({ success: false, message: 'AUTHORIZATION_DENIED', errorCode: 'UNEXPECTED_ERROR', errors: [] }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(
      await screen.findByText('You do not have permission to perform this action.'),
    ).toBeInTheDocument();
  });

  it('renders a safe conflict message on 409 (stale version)', async () => {
    renderDashboard(() =>
      new Response(JSON.stringify({ success: false, message: 'SELLER_STATE_CONFLICT', errorCode: 'UNEXPECTED_ERROR', errors: [] }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(
      await screen.findByText('This action conflicts with the current state. Refresh and try again.'),
    ).toBeInTheDocument();
  });

  it('renders a safe rate-limited message on 429', async () => {
    renderDashboard(() =>
      new Response(JSON.stringify({ success: false, message: 'RATE_LIMIT_EXCEEDED', errorCode: 'UNEXPECTED_ERROR', errors: [] }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(
      await screen.findByText('Too many requests. Please try again shortly.'),
    ).toBeInTheDocument();
  });

  it('creates onboarding from the start prompt', async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const client = new SellerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => null,
      fetchImpl: vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requests.push({ url, init });
        if (init?.method === 'POST') {
          return Promise.resolve(
            new Response(JSON.stringify({ data: { seller: { state: 'DRAFT', version: 1 } }, correlationId: 'c1' }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ success: false, message: 'SELLER_NOT_FOUND', errorCode: 'RESOURCE_NOT_FOUND', errors: [] }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }) as typeof fetch,
    });
    render(
      <SellerApiProvider client={client}>
        <OnboardingDashboard />
      </SellerApiProvider>,
    );

    await screen.findByText('Start seller onboarding');
    fireEvent.click(screen.getByRole('button', { name: 'Start onboarding' }));
    await screen.findByText('Business details');

    fireEvent.change(screen.getByLabelText('Legal name'), { target: { value: 'Walrus Retail' } });
    fireEvent.change(screen.getByLabelText('Trade name'), { target: { value: 'Walrus' } });
    fireEvent.change(screen.getByLabelText(/Registration number/), { target: { value: 'GSTIN1234567890123' } });
    fireEvent.change(screen.getByLabelText('Business address'), { target: { value: '1 Market Street' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create onboarding' }));

    expect(await screen.findByText('Onboarding created.')).toBeInTheDocument();
    const post = requests.find((request) => request.init?.method === 'POST');
    expect(post?.init?.body).toContain('Walrus Retail');
  });

  it('submits the DRAFT onboarding and refetches into the under-review view', async () => {
    let submitted = false;
    const client = new SellerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => null,
      fetchImpl: vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          submitted = true;
          return Promise.resolve(
            new Response(JSON.stringify({ data: { seller: { state: 'SUBMITTED', version: 2 } }, correlationId: 'c1' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                seller: submitted
                  ? onboardingStatus({ state: 'SUBMITTED', complianceState: 'IN_PROGRESS' })
                  : onboardingStatus(),
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
        <OnboardingDashboard />
      </SellerApiProvider>,
    );

    await screen.findByText('Onboarding in progress');
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    // The client never decides the transition — it refetches the server state.
    expect(await screen.findByText('Under review')).toBeInTheDocument();
  });

  it('saves edited details through the details editor', async () => {
    const patched: { url: string; init: RequestInit | undefined }[] = [];
    const client = new SellerApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => null,
      fetchImpl: vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          patched.push({ url, init });
          return Promise.resolve(
            new Response(JSON.stringify({ data: { seller: { state: 'DRAFT', version: 2 } }, correlationId: 'c1' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ data: { seller: onboardingStatus() }, correlationId: 'c1' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }) as typeof fetch,
    });
    render(
      <SellerApiProvider client={client}>
        <OnboardingDashboard />
      </SellerApiProvider>,
    );

    await screen.findByText('Onboarding in progress');
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    await screen.findByRole('button', { name: 'Save changes' });
    fireEvent.change(screen.getByLabelText('Trade name'), { target: { value: 'Walrus New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(patched.length).toBe(1);
    expect(patched[0]?.init?.body).toContain('Walrus New');
  });
});
