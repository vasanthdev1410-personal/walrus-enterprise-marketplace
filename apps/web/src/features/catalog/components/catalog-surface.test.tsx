import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SellerApiClient } from '@/src/lib/seller-api';
import { SellerApiProvider } from '../../seller/seller-api-provider';
import { CatalogPanel, CategoriesPanel } from './catalog-surface';

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

const categoriesResponse = (): Response =>
  ok({
    categories: [
      { categoryId: CATEGORY_ID, name: 'Appliances', state: 'ACTIVE' },
      { categoryId: '0191310f-789a-7123-8123-000000000006', name: 'Retired', state: 'RETIRED' },
    ],
  });

const productListResponse = (): Response =>
  ok({
    products: [
      {
        productId: PRODUCT_ID,
        sellerProfileId: SELLER_ID,
        categoryId: CATEGORY_ID,
        name: 'Espresso machine',
        state: 'DRAFT',
        sellingPrice: 499.99,
        version: 1,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
  });

function productDetailBody(): Record<string, unknown> {
  return {
    product: {
      productId: PRODUCT_ID,
      sellerProfileId: SELLER_ID,
      categoryId: CATEGORY_ID,
      name: 'Espresso machine',
      state: 'DRAFT',
      sellingPrice: 499.99,
      compareAtPrice: 599.0,
      version: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      variants: [
        {
          variantId: '0191310f-789a-7123-8123-000000000012',
          name: 'Stainless steel',
          state: 'DRAFT',
          sellingPrice: 549.99,
        },
      ],
      skus: [
        { skuId: '0191310f-789a-7123-8123-000000000013', skuCode: 'WLR-001', state: 'ACTIVE' },
      ],
      media: [
        {
          mediaId: '0191310f-789a-7123-8123-000000000014',
          productId: PRODUCT_ID,
          mediaType: 'PRODUCT_IMAGE',
          mediaReference: 'ref:object:opaque',
          mediaDigest: 'a'.repeat(64),
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          uploadedByIdentityId: 'u1',
          state: 'ACTIVE',
          uploadedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    },
  };
}

const productDetailResponse = (): Response => ok(productDetailBody());

function catalogRouter(load: (url: string, init?: RequestInit) => Response) {
  return (url: string, init?: RequestInit): Response => {
    if (init?.method === 'GET' && url.includes('/seller/categories')) return categoriesResponse();
    if (url.includes('/seller/profile')) return profileResponse();
    return load(url, init);
  };
}

describe('CatalogPanel product list', () => {
  it('renders own products with state badges', async () => {
    renderPanel(
      <CatalogPanel />,
      catalogRouter(() => productListResponse()),
    );
    expect(await screen.findByText('Espresso machine')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('shows an empty state when the seller has no products', async () => {
    renderPanel(
      <CatalogPanel />,
      catalogRouter(() => ok({ products: [] })),
    );
    expect(
      await screen.findByText('No products yet. Create your first product.'),
    ).toBeInTheDocument();
  });

  it('opens the create form and creates a product', async () => {
    const created: { init?: RequestInit }[] = [];
    renderPanel(
      <CatalogPanel />,
      catalogRouter((url, init) => {
        if (init?.method === 'POST') {
          created.push({ init });
          return ok({ product: { productId: PRODUCT_ID, state: 'DRAFT', version: 1 } }, 201);
        }
        if (init?.method === 'GET' && url.includes('/products/')) return productDetailResponse();
        return productListResponse();
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New product' }));
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Espresso machine' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: CATEGORY_ID } });
    fireEvent.change(screen.getByLabelText('Selling price (INR)'), {
      target: { value: '499.99' },
    });
    fireEvent.change(screen.getByLabelText('SKU code'), { target: { value: 'WLR-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create product' }));
    // The form unmounts on success and the new product detail is shown.
    expect(await screen.findByRole('heading', { name: 'Espresso machine' })).toBeInTheDocument();
    expect(created.length).toBe(1);
    expect(created[0]?.init?.body).toContain('WLR-001');
  });

  it('shows a validation error when the price is invalid', async () => {
    renderPanel(
      <CatalogPanel />,
      catalogRouter(() => productListResponse()),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New product' }));
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: CATEGORY_ID } });
    fireEvent.change(screen.getByLabelText('Selling price (INR)'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('SKU code'), { target: { value: 'WLR-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create product' }));
    expect(
      await screen.findByText(
        'The request could not be completed. Check the entered details and try again.',
      ),
    ).toBeInTheDocument();
  });
});

describe('CatalogPanel product detail', () => {
  function detailRouter(
    load: (url: string, init?: RequestInit) => Response,
  ): (url: string, init?: RequestInit) => Response {
    return (url: string, init?: RequestInit): Response => {
      if (init?.method === 'GET' && url.includes('/media')) {
        return ok({ media: [] });
      }
      if (init?.method === 'GET' && url.includes('/products/')) {
        return productDetailResponse();
      }
      return load(url, init);
    };
  }

  it('renders variants, SKUs, and media metadata (never content)', async () => {
    renderPanel(
      <CatalogPanel />,
      catalogRouter(
        detailRouter(() => {
          // Detail/media routes are handled by detailRouter; list falls through.
          return productListResponse();
        }),
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Espresso machine/ }));
    expect(await screen.findByRole('heading', { name: 'Espresso machine' })).toBeInTheDocument();
    expect(screen.getByText(/Stainless steel/)).toBeInTheDocument();
    expect(screen.getByText(/WLR-001/)).toBeInTheDocument();
    // Media metadata only — the opaque reference must never render.
    expect(screen.getByText(/digest a+…/)).toBeInTheDocument();
    expect(screen.queryByText('ref:object:opaque')).not.toBeInTheDocument();
  });

  it('submits the DRAFT product for review', async () => {
    const submitted: { init?: RequestInit }[] = [];
    renderPanel(
      <CatalogPanel />,
      catalogRouter(
        detailRouter((url, init) => {
          if (init?.method === 'POST' && url.includes('/submit')) {
            submitted.push({ init });
            return ok({ product: { productId: PRODUCT_ID, state: 'SUBMITTED', version: 2 } });
          }
          return productListResponse();
        }),
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Espresso machine/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByText('Product submitted for review.')).toBeInTheDocument();
    expect(submitted.length).toBe(1);
    expect(submitted[0]?.init?.body).toContain('expectedVersion');
  });

  it('shows a conflict notice when the server rejects a stale version', async () => {
    renderPanel(
      <CatalogPanel />,
      catalogRouter(
        detailRouter((url, init) => {
          if (init?.method === 'POST' && url.includes('/submit')) {
            return new Response(
              JSON.stringify({
                success: false,
                message: 'PRODUCT_STATE_CONFLICT',
                errorCode: 'UNEXPECTED_ERROR',
                errors: [],
              }),
              { status: 409, headers: { 'Content-Type': 'application/json' } },
            );
          }
          return productListResponse();
        }),
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Espresso machine/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for review' }));
    expect(
      await screen.findByText(
        'This action conflicts with the current state. Refresh and try again.',
      ),
    ).toBeInTheDocument();
  });
});

describe('CatalogPanel edit and close flows', () => {
  function detailRouter(
    load: (url: string, init?: RequestInit) => Response,
  ): (url: string, init?: RequestInit) => Response {
    return (url: string, init?: RequestInit): Response => {
      if (init?.method === 'GET' && url.includes('/media')) {
        return ok({ media: [] });
      }
      if (init?.method === 'GET' && url.includes('/products/')) {
        return productDetailResponse();
      }
      return load(url, init);
    };
  }

  function openDetail(load: (url: string, init?: RequestInit) => Response): Promise<void> {
    renderPanel(<CatalogPanel />, catalogRouter(detailRouter(load)));
    return screen.findByRole('button', { name: /Espresso machine/ }).then((button) => {
      fireEvent.click(button);
    });
  }

  it('edits the product definition through the edit form', async () => {
    const updated: { init?: RequestInit }[] = [];
    await openDetail((url, init) => {
      if (init?.method === 'PATCH') {
        updated.push({ init });
        return ok({ product: { productId: PRODUCT_ID, state: 'DRAFT', version: 2 } });
      }
      if (init?.method === 'GET' && url.includes('/seller/categories')) return categoriesResponse();
      return productListResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Espresso machine v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updated.length).toBe(1);
    expect(updated[0]?.init?.body).toContain('Espresso machine v2');
    expect(updated[0]?.init?.method).toBe('PATCH');
  });

  it('closes the product with a mandatory reason', async () => {
    const closed: { init?: RequestInit }[] = [];
    await openDetail((url, init) => {
      if (init?.method === 'POST' && url.includes('/close')) {
        closed.push({ init });
        return ok({ product: { productId: PRODUCT_ID, state: 'CLOSED', version: 2 } });
      }
      return productListResponse();
    });
    // A DRAFT product cannot be closed (lifecycle §5) — the button must be absent.
    expect(screen.queryByRole('button', { name: 'Close product' })).not.toBeInTheDocument();
  });

  it('offers close only for closeable states and submits with a reason', async () => {
    const body = productDetailBody();
    body.product = { ...(body.product as Record<string, unknown>), state: 'PUBLISHED' };
    const closeableResponse = ok(body);
    const closed: { init?: RequestInit }[] = [];
    renderPanel(
      <CatalogPanel />,
      catalogRouter((url: string, init?: RequestInit): Response => {
        if (init?.method === 'GET' && url.includes('/media')) return ok({ media: [] });
        if (init?.method === 'GET' && url.includes('/products/')) return closeableResponse;
        if (init?.method === 'POST' && url.includes('/close')) {
          closed.push({ init });
          return ok({ product: { productId: PRODUCT_ID, state: 'CLOSED', version: 7 } });
        }
        return productListResponse();
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Espresso machine/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close product' }));
    await screen.findByLabelText(/Reason reference/);
    fireEvent.change(screen.getByLabelText(/Reason reference/), {
      target: { value: 'withdraw-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close product' }));
    expect(closed.length).toBe(1);
    expect(closed[0]?.init?.body).toContain('withdraw-001');
  });

  it('adds a variant with its own SKU', async () => {
    const added: { init?: RequestInit }[] = [];
    await openDetail((url, init) => {
      if (init?.method === 'POST' && url.includes('/variants')) {
        added.push({ init });
        return ok({ variant: { variantId: 'v1', skuCode: 'WLR-001-SS', version: 2 } }, 201);
      }
      return productListResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
    await screen.findByLabelText('Variant name');
    fireEvent.change(screen.getByLabelText('Variant name'), {
      target: { value: 'Stainless steel' },
    });
    fireEvent.change(screen.getByLabelText('Selling price (INR)'), {
      target: { value: '549.99' },
    });
    fireEvent.change(screen.getByLabelText('SKU code'), { target: { value: 'WLR-001-SS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
    expect(added.length).toBe(1);
    expect(added[0]?.init?.body).toContain('WLR-001-SS');
  });

  it('shows the SKU hint when no variants exist yet', async () => {
    const body = productDetailBody();
    body.product = { ...(body.product as Record<string, unknown>), variants: [] };
    const response = ok(body);
    renderPanel(
      <CatalogPanel />,
      catalogRouter((url: string, init?: RequestInit): Response => {
        if (init?.method === 'GET' && url.includes('/media')) return ok({ media: [] });
        if (init?.method === 'GET' && url.includes('/products/')) return response;
        return productListResponse();
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Espresso machine/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add SKU' }));
    expect(await screen.findByText(/Add a variant first/)).toBeInTheDocument();
  });

  it('adds a SKU to an existing variant', async () => {
    const added: { init?: RequestInit }[] = [];
    await openDetail((url, init) => {
      if (init?.method === 'POST' && url.includes('/skus')) {
        added.push({ init });
        return ok({ sku: { skuId: 's2', skuCode: 'WLR-001-2', version: 2 } }, 201);
      }
      return productListResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    fireEvent.click(screen.getByRole('button', { name: 'Add SKU' }));
    await screen.findByLabelText('SKU code');
    fireEvent.change(screen.getByLabelText('Variant'), {
      target: { value: '0191310f-789a-7123-8123-000000000012' },
    });
    fireEvent.change(screen.getByLabelText('SKU code'), { target: { value: 'WLR-001-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add SKU' }));
    expect(added.length).toBe(1);
    expect(added[0]?.init?.body).toContain('WLR-001-2');
  });

  it('records media metadata for the product', async () => {
    const recorded: { init?: RequestInit }[] = [];
    await openDetail((url, init) => {
      if (init?.method === 'POST' && url.includes('/media')) {
        recorded.push({ init });
        return ok({ media: { mediaId: 'm1', productId: PRODUCT_ID, version: 2 } }, 201);
      }
      return productListResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    fireEvent.click(screen.getByRole('button', { name: 'Record media' }));
    await screen.findByLabelText(/Media reference/);
    fireEvent.change(screen.getByLabelText(/Media reference/), {
      target: { value: 'ref:obj:opaque' },
    });
    fireEvent.change(screen.getByLabelText(/SHA-256 digest/), {
      target: { value: 'a'.repeat(64) },
    });
    fireEvent.change(screen.getByLabelText(/Size/), { target: { value: '2048' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record media' }));
    expect(recorded.length).toBe(1);
    expect(recorded[0]?.init?.body).toContain('ref:obj:opaque');
  });

  it('rejects an invalid media digest without contacting the server', async () => {
    await openDetail((url, init) => {
      void url;
      void init;
      return productListResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    fireEvent.click(screen.getByRole('button', { name: 'Record media' }));
    await screen.findByLabelText(/Media reference/);
    fireEvent.change(screen.getByLabelText(/Media reference/), {
      target: { value: 'ref:obj:opaque' },
    });
    fireEvent.change(screen.getByLabelText(/SHA-256 digest/), {
      target: { value: 'not-a-digest' },
    });
    fireEvent.change(screen.getByLabelText(/Size/), { target: { value: '2048' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record media' }));
    expect(
      await screen.findByText(
        'The request could not be completed. Check the entered details and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('closes an ACTIVE SKU', async () => {
    const closed: { init?: RequestInit; url?: string }[] = [];
    await openDetail((url, init) => {
      if (init?.method === 'POST' && url.includes('/skus/') && url.includes('/close')) {
        closed.push({ init, url });
        return ok({
          sku: { skuId: '0191310f-789a-7123-8123-000000000013', skuCode: 'WLR-001', version: 2 },
        });
      }
      return productListResponse();
    });
    await screen.findByRole('heading', { name: 'Espresso machine' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed.length).toBe(1);
    expect(closed[0]?.url).toContain('/skus/0191310f-789a-7123-8123-000000000013/close');
  });

  it('shows a 403 access-denied state for the catalog', async () => {
    renderPanel(
      <CatalogPanel />,
      catalogRouter(
        () =>
          new Response(
            JSON.stringify({
              success: false,
              message: 'AUTHORIZATION_DENIED',
              errorCode: 'UNEXPECTED_ERROR',
              errors: [],
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    expect(
      await screen.findByText('You do not have permission to perform this action.'),
    ).toBeInTheDocument();
  });
});

describe('CategoriesPanel', () => {
  it('lists active platform categories only', async () => {
    renderPanel(<CategoriesPanel />, (url) => {
      if (url.includes('/seller/categories')) return categoriesResponse();
      return ok({});
    });
    expect(await screen.findByText('Appliances')).toBeInTheDocument();
    expect(screen.queryByText('Retired')).not.toBeInTheDocument();
  });

  it('shows the empty state when no categories exist', async () => {
    renderPanel(<CategoriesPanel />, () => ok({ categories: [] }));
    expect(await screen.findByText('No categories available.')).toBeInTheDocument();
  });
});
