'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AdminProductDetailResult,
  ProductListEntry,
  ProductReviewAction,
  ProductState,
  SellerApiClient,
  SellerApiErrorKind,
} from '@/src/lib/seller-api';
import { SellerApiError } from '@/src/lib/seller-api';
import { useSellerApi } from '../../seller/seller-api-provider';
import { AsyncBoundary, EmptyNotice, ErrorNotice } from '../../seller/components/async';
import { useAsync } from '../../seller/components/async';
import {
  formatPrice,
  PRODUCT_STATE_LABELS,
  ProductStateBadge,
} from '../../catalog/components/product-status-display';

function toKind(error: unknown): SellerApiErrorKind {
  return error instanceof SellerApiError ? error.kind : 'SERVER';
}

export const PRODUCT_STATE_FILTERS: readonly ProductState[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'CORRECTIONS_REQUESTED',
  'UNPUBLISHED',
  'REJECTED',
  'CLOSED',
];

// ---------------------------------------------------------------------------
// Admin product list (GET /admin/products, optional state filter)
// ---------------------------------------------------------------------------

export function AdminProductList({
  onSelect,
}: {
  readonly onSelect: (productId: string) => void;
}): ReactNode {
  const client = useSellerApi();
  const [stateFilter, setStateFilter] = useState<ProductState | undefined>(undefined);
  const load = useCallback(() => client.adminListProducts(stateFilter), [client, stateFilter]);
  const state = useAsync(load, [load]);
  return (
    <div className="panel">
      <h2>Products</h2>
      <label className="filter">
        State
        <select
          value={stateFilter ?? ''}
          onChange={(event) => {
            setStateFilter(
              event.target.value === '' ? undefined : (event.target.value as ProductState),
            );
          }}
        >
          <option value="">All</option>
          {PRODUCT_STATE_FILTERS.map((value) => (
            <option key={value} value={value}>
              {PRODUCT_STATE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <AsyncBoundary
        state={state}
        empty={(products) =>
          products.length === 0 ? <EmptyNotice>No products found.</EmptyNotice> : null
        }
      >
        {(products: readonly ProductListEntry[]) => (
          <ul className="plain-list">
            {products.map((product) => (
              <li key={product.productId}>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    onSelect(product.productId);
                  }}
                >
                  <ProductStateBadge state={product.state} /> {product.name}
                  <span className="muted"> — {formatPrice(product.sellingPrice)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin product detail + audit + moderation actions
// ---------------------------------------------------------------------------

export function AdminProductDetail({ productId }: { readonly productId: string }): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.adminGetProductDetail(productId), [client, productId]);
  const state = useAsync(load, [load]);
  return (
    <AsyncBoundary state={state}>
      {(product: AdminProductDetailResult) => (
        <div className="panel">
          <h2>{product.name}</h2>
          <p>
            Status: <ProductStateBadge state={product.state} />
          </p>
          <div className="muted detail-list">
            <p>Selling price: {formatPrice(product.sellingPrice)}</p>
            {product.compareAtPrice !== undefined && (
              <p>Compare-at price: {formatPrice(product.compareAtPrice)}</p>
            )}
            <p>Version: {product.version}</p>
            <p className="id">Product ID: {product.productId}</p>
            <p className="id">Seller: {product.sellerProfileId}</p>
          </div>
          <AdminVariants product={product} />
          <AdminSkus product={product} />
          <AdminMedia productId={productId} />
          <AdminTransitions product={product} />
          <AdminAudit product={product} />
          <AdminReviewActions product={product} />
        </div>
      )}
    </AsyncBoundary>
  );
}

function AdminVariants({ product }: { readonly product: AdminProductDetailResult }): ReactNode {
  return (
    <div className="panel-sub">
      <h3>Variants</h3>
      {product.variants.length === 0 ? (
        <EmptyNotice>No variants.</EmptyNotice>
      ) : (
        <ul className="plain-list">
          {product.variants.map((variant) => (
            <li key={variant.variantId}>
              {variant.name} — {formatPrice(variant.sellingPrice)}
              <span className="muted"> ({PRODUCT_STATE_LABELS[variant.state]})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminSkus({ product }: { readonly product: AdminProductDetailResult }): ReactNode {
  return (
    <div className="panel-sub">
      <h3>SKUs</h3>
      {product.skus.length === 0 ? (
        <EmptyNotice>No SKUs.</EmptyNotice>
      ) : (
        <ul className="plain-list">
          {product.skus.map((sku) => (
            <li key={sku.skuId}>
              <span className="id">{sku.skuCode}</span>
              <span className="muted">
                {' '}
                — {sku.state === 'ACTIVE' ? 'Active' : 'Closed'}
                {sku.variantId !== undefined ? ' (variant)' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminMedia({ productId }: { readonly productId: string }): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.adminGetProductMedia(productId), [client, productId]);
  const state = useAsync(load, [load]);
  return (
    <div className="panel-sub">
      <h3>Media metadata</h3>
      <p className="muted">Metadata only — references and digests, never content.</p>
      <AsyncBoundary state={state}>
        {(media) =>
          media.length === 0 ? (
            <EmptyNotice>No media records.</EmptyNotice>
          ) : (
            <ul className="plain-list">
              {media.map((item) => (
                <li key={item.mediaId}>
                  {item.mediaType} ({item.mimeType}, {item.sizeBytes} bytes)
                  <span className="muted">
                    {' '}
                    — digest {item.mediaDigest.slice(0, 12)}…, uploaded {item.uploadedAt}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </AsyncBoundary>
    </div>
  );
}

function AdminTransitions({ product }: { readonly product: AdminProductDetailResult }): ReactNode {
  return (
    <div className="panel-sub">
      <h3>Lifecycle history</h3>
      {product.transitions.length === 0 ? (
        <EmptyNotice>No transitions recorded.</EmptyNotice>
      ) : (
        <ul className="plain-list">
          {product.transitions.map((transition, index) => (
            <li key={`${String(transition.stateVersion)}-${String(index)}`}>
              {transition.fromState === undefined
                ? 'Initial'
                : PRODUCT_STATE_LABELS[transition.fromState]}{' '}
              → {PRODUCT_STATE_LABELS[transition.toState]}{' '}
              <span className="muted">
                {' '}
                — {transition.actorKind}, v{String(transition.stateVersion)},{' '}
                {transition.transitionedAt}
                {transition.reasonReference !== undefined
                  ? `, reason ${transition.reasonReference}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminAudit({ product }: { readonly product: AdminProductDetailResult }): ReactNode {
  return (
    <div className="panel-sub">
      <h3>Audit episodes</h3>
      {product.audit.length === 0 ? (
        <EmptyNotice>No audit episodes.</EmptyNotice>
      ) : (
        <ul className="plain-list">
          {product.audit.map((record) => (
            <li key={`${record.eventType}-${record.occurredAt}`}>
              <span className="id">{record.eventType}</span>
              <span className="muted">
                {' '}
                — actor {record.actorIdentityId.slice(0, 12)}…, {record.occurredAt}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Moderation actions per state (lifecycle §5, decision D-10/D-12). The server
// remains authoritative — these mirrors only enable what the approved
// transition table permits.
const REVIEW_ACTIONS: readonly {
  readonly action: ProductReviewAction;
  readonly label: string;
  readonly requiresReason: boolean;
  readonly applicableIn: readonly ProductState[];
}[] = [
  {
    action: 'CLAIM_REVIEW',
    label: 'Claim review',
    requiresReason: false,
    applicableIn: ['SUBMITTED'],
  },
  {
    action: 'REQUEST_CORRECTIONS',
    label: 'Request corrections',
    requiresReason: true,
    applicableIn: ['UNDER_REVIEW'],
  },
  {
    action: 'APPROVE',
    label: 'Approve',
    requiresReason: false,
    applicableIn: ['UNDER_REVIEW'],
  },
  {
    action: 'REJECT',
    label: 'Reject',
    requiresReason: true,
    applicableIn: ['SUBMITTED', 'UNDER_REVIEW', 'CORRECTIONS_REQUESTED'],
  },
  {
    action: 'PUBLISH',
    label: 'Publish',
    requiresReason: false,
    applicableIn: ['APPROVED'],
  },
];

function AdminReviewActions({
  product,
}: {
  readonly product: AdminProductDetailResult;
}): ReactNode {
  const client = useSellerApi();
  const [notice, setNotice] = useState<ReactNode>(null);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');

  function run(action: ProductReviewAction, requiresReason: boolean): void {
    if (requiresReason && reason.trim().length === 0) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    void review(
      client,
      product,
      action,
      requiresReason ? reason.trim() : undefined,
      setSaving,
      setNotice,
    );
  }

  const applicable = REVIEW_ACTIONS.filter((entry) => entry.applicableIn.includes(product.state));
  if (applicable.length === 0) {
    return (
      <div className="panel-sub">
        <h3>Review</h3>
        <p className="muted">
          No moderation actions are available in the {PRODUCT_STATE_LABELS[product.state]} state.
        </p>
      </div>
    );
  }

  return (
    <div className="panel-sub">
      <h3>Review</h3>
      <div className="actions">
        {applicable.map((entry) => (
          <button
            key={entry.action}
            type="button"
            className="btn"
            disabled={saving}
            onClick={() => {
              run(entry.action, entry.requiresReason);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <label className="form">
        Reason (required for corrections / reject)
        <input
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
          maxLength={512}
        />
      </label>
      {notice}
    </div>
  );
}

async function review(
  client: SellerApiClient,
  product: AdminProductDetailResult,
  action: ProductReviewAction,
  reasonReference: string | undefined,
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.adminReviewProduct({
      productId: product.productId,
      action,
      expectedVersion: product.version,
      ...(reasonReference === undefined ? {} : { reasonReference }),
    });
    setNotice(
      <div className="notice" role="status">
        Review decision recorded.
      </div>,
    );
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}
