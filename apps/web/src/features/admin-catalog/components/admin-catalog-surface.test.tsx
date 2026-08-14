import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SellerApiClient } from '@/src/lib/seller-api';
import { SellerApiProvider } from '../../seller/seller-api-provider';
import { AdminProductDetail, AdminProductList } from './admin-catalog-surface';

const SELLER_ID = '0191310f-789a-7123-8123-000000000003';
const CATEGORY_ID = '0191310f-789a-7123-8123-000000000005';
const PRODUCT_ID = '0191310f-789a-7123-8123-000000000011';

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

function detailBody(): Record<string, unknown> {
  return {
    product: {
      productId: PRODUCT_ID,
      sellerProfileId: SELLER_ID,
      categoryId: CATEGORY_ID,
      name: 'Espresso machine',
      state: 'SUBMITTED',
      sellingPrice: 499.99,
      version: 2,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      variants: [],
      skus: [{ skuId: 's1', skuCode: 'WLR-001', state: 'ACTIVE' }],
      media: [],
      transitions: [
        { toState: 'DRAFT', stateVersion: 1, actorKind: 'SELLER', transitionedAt: 't1' },
        {
          fromState: 'DRAFT',
          toState: 'SUBMITTED',
          stateVersion: 2,
          actorKind: 'SELLER',
          transitionedAt: 't2',
        },
      ],
      audit: [{ eventType: 'PRODUCT_SUBMITTED', actorIdentityId: 'u1', occurredAt: 't2' }],
    },
  };
}

const detailResponse = (): Response => ok(detailBody());

describe('AdminProductList', () => {
  it('lists products and applies the state filter', async () => {
    const calls: string[] = [];
    renderPanel(
      <AdminProductList
        onSelect={() => {
          /* noop */
        }}
      />,
      (url) => {
        calls.push(url);
        return ok({ products: [] });
      },
    );
    expect(await screen.findByText('Products')).toBeInTheDocument();
    expect(calls.some((url) => url.includes('/admin/products'))).toBe(true);

    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'SUBMITTED' } });
    expect(await screen.findByText('Products')).toBeInTheDocument();
    expect(calls.some((url) => url.includes('state=SUBMITTED'))).toBe(true);
  });

  it('renders an empty state when no products match', async () => {
    renderPanel(
      <AdminProductList
        onSelect={() => {
          /* noop */
        }}
      />,
      () => ok({ products: [] }),
    );
    expect(await screen.findByText('No products found.')).toBeInTheDocument();
  });

  it('renders product rows and invokes the selection callback', async () => {
    const selected: string[] = [];
    renderPanel(
      <AdminProductList
        onSelect={(productId: string) => {
          selected.push(productId);
        }}
      />,
      () =>
        ok({
          products: [
            {
              productId: PRODUCT_ID,
              sellerProfileId: SELLER_ID,
              categoryId: CATEGORY_ID,
              name: 'Espresso machine',
              state: 'SUBMITTED',
              sellingPrice: 499.99,
              version: 2,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Espresso machine/ }));
    expect(selected).toEqual([PRODUCT_ID]);
  });
});

describe('AdminProductDetail', () => {
  it('renders detail, SKUs, transitions, and audit episodes', async () => {
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url) => {
      if (url.includes('/media')) return ok({ media: [] });
      return detailResponse();
    });
    expect(await screen.findByRole('heading', { name: 'Espresso machine' })).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('WLR-001')).toBeInTheDocument();
    // Lifecycle history renders transitions (append-only).
    expect(screen.getByText('Initial → Draft')).toBeInTheDocument();
    expect(screen.getByText('Draft → Submitted')).toBeInTheDocument();
    // Audit episodes render event type + actor, never internals.
    expect(screen.getByText('PRODUCT_SUBMITTED')).toBeInTheDocument();
  });

  it('offers moderation actions only for the approved transition table', async () => {
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url) => {
      if (url.includes('/media')) return ok({ media: [] });
      return detailResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    // SUBMITTED → claim review / reject (both permitted).
    expect(screen.getByRole('button', { name: 'Claim review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    // Approve/publish require UNDER_REVIEW/APPROVED — must not be offered.
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('records an admin review decision', async () => {
    const review: { init?: RequestInit }[] = [];
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url, init) => {
      if (init?.method === 'POST' && url.includes('/review')) {
        review.push({ init });
        return ok({ product: { productId: PRODUCT_ID, state: 'UNDER_REVIEW', version: 3 } });
      }
      if (url.includes('/media')) return ok({ media: [] });
      return detailResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    fireEvent.click(screen.getByRole('button', { name: 'Claim review' }));
    expect(await screen.findByText('Review decision recorded.')).toBeInTheDocument();
    expect(review.length).toBe(1);
    expect(review[0]?.init?.body).toContain('CLAIM_REVIEW');
  });

  it('requires a reason for reject decisions', async () => {
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url) => {
      if (url.includes('/media')) return ok({ media: [] });
      return detailResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(
      await screen.findByText(
        'The request could not be completed. Check the entered details and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a generic access-denied state when the grant is missing', async () => {
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url) => {
      if (url.includes('/media')) return ok({ media: [] });
      return new Response(
        JSON.stringify({
          success: false,
          message: 'AUTHORIZATION_DENIED',
          errorCode: 'UNEXPECTED_ERROR',
          errors: [],
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    });
    expect(
      await screen.findByText('You do not have permission to perform this action.'),
    ).toBeInTheDocument();
  });

  it('shows the no-actions state for a state without moderation actions', async () => {
    const body = detailBody();
    (body.product as Record<string, unknown>).state = 'PUBLISHED';
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url) => {
      if (url.includes('/media')) return ok({ media: [] });
      return ok(body);
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    expect(
      await screen.findByText('No moderation actions are available in the Published state.'),
    ).toBeInTheDocument();
  });

  it('renders media metadata rows and the empty state', async () => {
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url) => {
      if (url.includes('/media')) {
        return ok({
          media: [
            {
              mediaId: 'm1',
              productId: PRODUCT_ID,
              mediaType: 'PRODUCT_IMAGE',
              mediaReference: 'ref:object:opaque',
              mediaDigest: 'a'.repeat(64),
              mimeType: 'image/jpeg',
              sizeBytes: 2048,
              uploadedByIdentityId: 'u1',
              state: 'ACTIVE',
              uploadedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        });
      }
      return detailResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    expect(await screen.findByText(/digest aaaaaaaaaaaa/)).toBeInTheDocument();
    // Opaque reference must never render.
    expect(screen.queryByText('ref:object:opaque')).not.toBeInTheDocument();
  });

  it('renders variants with prices', async () => {
    const body = detailBody();
    (body.product as Record<string, unknown>).variants = [
      {
        variantId: '0191310f-789a-7123-8123-000000000012',
        name: 'Stainless steel',
        state: 'SUBMITTED',
        sellingPrice: 549.99,
      },
    ];
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url) => {
      if (url.includes('/media')) return ok({ media: [] });
      return ok(body);
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    expect(await screen.findByText(/Stainless steel/)).toBeInTheDocument();
  });

  it('surfaces a safe generic error when the review request fails', async () => {
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url, init) => {
      if (init?.method === 'POST' && url.includes('/review')) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'An unexpected error occurred.',
            errorCode: 'UNEXPECTED_ERROR',
            errors: [],
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/media')) return ok({ media: [] });
      return detailResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    fireEvent.click(screen.getByRole('button', { name: 'Claim review' }));
    expect(
      await screen.findByText('An unexpected error occurred. Please try again shortly.'),
    ).toBeInTheDocument();
  });

  it('renders empty transitions and audit episodes', async () => {
    const body = detailBody();
    (body.product as Record<string, unknown>).transitions = [];
    (body.product as Record<string, unknown>).audit = [];
    renderPanel(<AdminProductDetail productId={PRODUCT_ID} />, (url) => {
      if (url.includes('/media')) return ok({ media: [] });
      return ok(body);
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    expect(await screen.findByText('No transitions recorded.')).toBeInTheDocument();
    expect(screen.getByText('No audit episodes.')).toBeInTheDocument();
  });
});
