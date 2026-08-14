'use client';

import { useCallback, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import type {
  CategorySummary,
  MediaMetadataEntry,
  ProductDetailResult,
  ProductListEntry,
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
  SELLER_CLOSEABLE_STATES,
  SELLER_EDITABLE_STATES,
  SELLER_SUBMITTABLE_STATES,
} from './product-status-display';

function toKind(error: unknown): SellerApiErrorKind {
  return error instanceof SellerApiError ? error.kind : 'SERVER';
}

// ---------------------------------------------------------------------------
// Seller product catalog (WEMP-M04-SPEC-001 §19, decision D-14). The server
// remains authoritative for authorization and lifecycle decisions; this UI
// renders server data and surfaces generic, non-disclosing error states.
// ---------------------------------------------------------------------------

export function CatalogPanel(): ReactNode {
  const client = useSellerApi();
  const loadProfile = useCallback(() => client.getProfile(), [client]);
  const profileState = useAsync(loadProfile, [loadProfile]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (profileState.status === 'loading') return <p className="notice">Loading…</p>;
  if (profileState.status === 'error') return <ErrorNotice kind={profileState.kind} />;
  const sellerProfileId = profileState.data.sellerProfileId;

  if (selectedProductId !== null) {
    return (
      <ProductDetailPanel
        productId={selectedProductId}
        sellerProfileId={sellerProfileId}
        onBack={() => {
          setSelectedProductId(null);
        }}
        onChanged={(productId) => {
          setSelectedProductId(productId);
        }}
      />
    );
  }

  return (
    <div className="panel">
      <h2>Products</h2>
      <ProductList
        sellerProfileId={sellerProfileId}
        onSelect={(productId) => {
          setSelectedProductId(productId);
        }}
      />
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setCreating((current) => !current);
          }}
        >
          {creating ? 'Close form' : 'New product'}
        </button>
      </div>
      {creating && (
        <ProductCreateForm
          sellerProfileId={sellerProfileId}
          onCreated={(productId) => {
            setCreating(false);
            setSelectedProductId(productId);
          }}
        />
      )}
    </div>
  );
}

function ProductList({
  sellerProfileId,
  onSelect,
}: {
  readonly sellerProfileId: string;
  readonly onSelect: (productId: string) => void;
}): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.listProducts(sellerProfileId), [client, sellerProfileId]);
  const state = useAsync(load, [load]);
  return (
    <AsyncBoundary
      state={state}
      empty={(products) =>
        products.length === 0 ? (
          <EmptyNotice>No products yet. Create your first product.</EmptyNotice>
        ) : null
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
  );
}

// ---------------------------------------------------------------------------
// Create (listing gate is enforced server-side: only APPROVED/ACTIVE sellers
// may list — §26)
// ---------------------------------------------------------------------------

function ProductCreateForm({
  sellerProfileId,
  onCreated,
}: {
  readonly sellerProfileId: string;
  readonly onCreated: (productId: string) => void;
}): ReactNode {
  const client = useSellerApi();
  const loadCategories = useCallback(() => client.listCategories(), [client]);
  const categoriesState = useAsync(loadCategories, [loadCategories]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (categoriesState.status !== 'ready') return;
    if (categoryId.length === 0) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    const price = parsePrice(sellingPrice);
    if (price === null) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    let compare: number | undefined;
    if (compareAtPrice.trim().length > 0) {
      const parsedCompare = parsePrice(compareAtPrice);
      if (parsedCompare === null) {
        setNotice(<ErrorNotice kind="VALIDATION" />);
        return;
      }
      compare = parsedCompare;
    }
    if (skuCode.trim().length === 0) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    void createProduct(
      client,
      sellerProfileId,
      {
        name: name.trim(),
        categoryId,
        sellingPrice: price,
        ...(compare === undefined ? {} : { compareAtPrice: compare }),
        skus: [{ skuCode: skuCode.trim() }],
      },
      setSaving,
      setNotice,
      onCreated,
    );
  }

  if (categoriesState.status === 'loading') return <p className="notice">Loading…</p>;
  if (categoriesState.status === 'error') return <ErrorNotice kind={categoriesState.kind} />;
  const categories = categoriesState.data.filter((category) => category.state === 'ACTIVE');

  return (
    // Custom validation surfaces the generic safe message; noValidate keeps
    // the browser's native pattern tooltip from blocking the submission.
    <form className="form" onSubmit={onSubmit} noValidate>
      <label>
        Name
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          required
          minLength={1}
          maxLength={256}
        />
      </label>
      <label>
        Category
        <select
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
          }}
          required
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.categoryId} value={category.categoryId}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Selling price (INR)
        <input
          value={sellingPrice}
          onChange={(event) => {
            setSellingPrice(event.target.value);
          }}
          required
          inputMode="decimal"
          placeholder="499.99"
        />
      </label>
      <label>
        Compare-at price (INR, optional)
        <input
          value={compareAtPrice}
          onChange={(event) => {
            setCompareAtPrice(event.target.value);
          }}
          inputMode="decimal"
          placeholder="599.00"
        />
      </label>
      <label>
        SKU code
        <input
          value={skuCode}
          onChange={(event) => {
            setSkuCode(event.target.value);
          }}
          required
          pattern="^[A-Z0-9][A-Z0-9_-]{0,63}$"
          title="Uppercase letters, digits, dash or underscore (1–64 characters)"
          placeholder="WLR-001"
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Create product
        </button>
      </div>
      {notice}
    </form>
  );
}

async function createProduct(
  client: SellerApiClient,
  sellerProfileId: string,
  input: {
    readonly name: string;
    readonly categoryId: string;
    readonly sellingPrice: number;
    readonly compareAtPrice?: number;
    readonly skus: readonly { readonly skuCode: string }[];
  },
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
  onCreated: (productId: string) => void,
): Promise<void> {
  setSaving(true);
  try {
    const result = await client.createProduct({ sellerProfileId, ...input });
    setNotice(
      <div className="notice" role="status">
        Product created as draft.
      </div>,
    );
    onCreated(result.productId);
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

// ---------------------------------------------------------------------------
// Detail + lifecycle actions (server decides; buttons mirror allowed states)
// ---------------------------------------------------------------------------

function ProductDetailPanel({
  productId,
  sellerProfileId,
  onBack,
  onChanged,
}: {
  readonly productId: string;
  readonly sellerProfileId: string;
  readonly onBack: () => void;
  readonly onChanged: (productId: string) => void;
}): ReactNode {
  const client = useSellerApi();
  const load = useCallback(
    () => client.getProductDetail(productId, sellerProfileId),
    [client, productId, sellerProfileId],
  );
  const state = useAsync(load, [load]);
  return (
    <AsyncBoundary state={state}>
      {(product: ProductDetailResult) => (
        <div className="panel">
          <div className="actions">
            <button type="button" className="btn" onClick={onBack}>
              Back to products
            </button>
          </div>
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
          </div>
          <VariantsSection product={product} sellerProfileId={sellerProfileId} />
          <SkusSection product={product} sellerProfileId={sellerProfileId} />
          <MediaSection product={product} sellerProfileId={sellerProfileId} />
          <ProductLifecycleActions
            product={product}
            sellerProfileId={sellerProfileId}
            onChanged={() => {
              onChanged(productId);
            }}
          />
        </div>
      )}
    </AsyncBoundary>
  );
}

function VariantsSection({
  product,
  sellerProfileId,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
}): ReactNode {
  const [adding, setAdding] = useState(false);
  return (
    <div className="panel-sub">
      <h3>Variants</h3>
      {product.variants.length === 0 ? (
        <EmptyNotice>No variants. Variants are optional — SKUs may attach directly.</EmptyNotice>
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
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setAdding((current) => !current);
          }}
        >
          {adding ? 'Close' : 'Add variant'}
        </button>
      </div>
      {adding && (
        <VariantAddForm
          product={product}
          sellerProfileId={sellerProfileId}
          onDone={() => {
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function VariantAddForm({
  product,
  sellerProfileId,
  onDone,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
  readonly onDone: () => void;
}): ReactNode {
  const client = useSellerApi();
  const [name, setName] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const price = parsePrice(sellingPrice);
    if (price === null || name.trim().length === 0 || skuCode.trim().length === 0) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    void addVariant(
      client,
      product,
      sellerProfileId,
      { name: name.trim(), sellingPrice: price, skuCode: skuCode.trim() },
      setSaving,
      setNotice,
      onDone,
    );
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <label>
        Variant name
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          required
          minLength={1}
          maxLength={256}
        />
      </label>
      <label>
        Selling price (INR)
        <input
          value={sellingPrice}
          onChange={(event) => {
            setSellingPrice(event.target.value);
          }}
          required
          inputMode="decimal"
        />
      </label>
      <label>
        SKU code
        <input
          value={skuCode}
          onChange={(event) => {
            setSkuCode(event.target.value);
          }}
          required
          pattern="^[A-Z0-9][A-Z0-9_-]{0,63}$"
          title="Uppercase letters, digits, dash or underscore (1–64 characters)"
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Add variant
        </button>
      </div>
      {notice}
    </form>
  );
}

async function addVariant(
  client: SellerApiClient,
  product: ProductDetailResult,
  sellerProfileId: string,
  values: { readonly name: string; readonly sellingPrice: number; readonly skuCode: string },
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
  onDone: () => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.addVariant({
      productId: product.productId,
      sellerProfileId,
      expectedVersion: product.version,
      ...values,
    });
    setNotice(
      <div className="notice" role="status">
        Variant added.
      </div>,
    );
    onDone();
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

function SkusSection({
  product,
  sellerProfileId,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
}): ReactNode {
  const [adding, setAdding] = useState(false);
  return (
    <div className="panel-sub">
      <h3>SKUs</h3>
      {product.skus.length === 0 ? (
        <EmptyNotice>No SKUs yet.</EmptyNotice>
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
              {sku.state === 'ACTIVE' && (
                <SkuCloseAction product={product} sellerProfileId={sellerProfileId} sku={sku} />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setAdding((current) => !current);
          }}
        >
          {adding ? 'Close' : 'Add SKU'}
        </button>
      </div>
      {adding && (
        <SkuAddForm
          product={product}
          sellerProfileId={sellerProfileId}
          onDone={() => {
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function SkuCloseAction({
  product,
  sellerProfileId,
  sku,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
  readonly sku: { readonly skuId: string; readonly skuCode: string };
}): ReactNode {
  const client = useSellerApi();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);
  return (
    <span>
      <button
        type="button"
        className="link"
        disabled={saving}
        onClick={() => {
          void closeSku(client, product, sellerProfileId, sku.skuId, setSaving, setNotice);
        }}
      >
        Close
      </button>
      {notice}
    </span>
  );
}

async function closeSku(
  client: SellerApiClient,
  product: ProductDetailResult,
  sellerProfileId: string,
  skuId: string,
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.closeSku({
      productId: product.productId,
      skuId,
      sellerProfileId,
      expectedVersion: product.version,
    });
    setNotice(<span className="muted"> SKU closed.</span>);
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

function SkuAddForm({
  product,
  sellerProfileId,
  onDone,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
  readonly onDone: () => void;
}): ReactNode {
  const client = useSellerApi();
  const [variantId, setVariantId] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (skuCode.trim().length === 0 || variantId.length === 0) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    void addSku(
      client,
      product,
      sellerProfileId,
      { skuCode: skuCode.trim(), variantId },
      setSaving,
      setNotice,
      onDone,
    );
  }

  if (product.variants.length === 0) {
    return (
      <p className="notice">Add a variant first — SKUs are attached to variants through the API.</p>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <label>
        Variant
        <select
          value={variantId}
          onChange={(event) => {
            setVariantId(event.target.value);
          }}
          required
        >
          <option value="">Select a variant</option>
          {product.variants.map((variant) => (
            <option key={variant.variantId} value={variant.variantId}>
              {variant.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        SKU code
        <input
          value={skuCode}
          onChange={(event) => {
            setSkuCode(event.target.value);
          }}
          required
          pattern="^[A-Z0-9][A-Z0-9_-]{0,63}$"
          title="Uppercase letters, digits, dash or underscore (1–64 characters)"
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Add SKU
        </button>
      </div>
      {notice}
    </form>
  );
}

async function addSku(
  client: SellerApiClient,
  product: ProductDetailResult,
  sellerProfileId: string,
  values: { readonly skuCode: string; readonly variantId: string },
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
  onDone: () => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.addSku({
      productId: product.productId,
      variantId: values.variantId,
      sellerProfileId,
      expectedVersion: product.version,
      skuCode: values.skuCode,
    });
    setNotice(
      <div className="notice" role="status">
        SKU added.
      </div>,
    );
    onDone();
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

function MediaSection({
  product,
  sellerProfileId,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
}): ReactNode {
  const [recording, setRecording] = useState(false);
  return (
    <div className="panel-sub">
      <h3>Media</h3>
      <p className="muted">Metadata only — references and integrity digests, never content.</p>
      {product.media.length === 0 ? (
        <EmptyNotice>No media recorded.</EmptyNotice>
      ) : (
        <ul className="plain-list">
          {product.media.map((media) => (
            <MediaRow key={media.mediaId} media={media} />
          ))}
        </ul>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setRecording((current) => !current);
          }}
        >
          {recording ? 'Close' : 'Record media'}
        </button>
      </div>
      {recording && (
        <MediaRecordForm
          product={product}
          sellerProfileId={sellerProfileId}
          onDone={() => {
            setRecording(false);
          }}
        />
      )}
    </div>
  );
}

function MediaRow({ media }: { readonly media: MediaMetadataEntry }): ReactNode {
  return (
    <li>
      {media.mediaType} ({media.mimeType}, {media.sizeBytes} bytes)
      <span className="muted">
        {' '}
        — digest {media.mediaDigest.slice(0, 12)}…, {media.state.toLowerCase()}
      </span>
    </li>
  );
}

function MediaRecordForm({
  product,
  sellerProfileId,
  onDone,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
  readonly onDone: () => void;
}): ReactNode {
  const client = useSellerApi();
  const [mediaReference, setMediaReference] = useState('');
  const [mediaDigest, setMediaDigest] = useState('');
  const [mimeType, setMimeType] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [sizeBytes, setSizeBytes] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const size = parseSize(sizeBytes);
    if (
      mediaReference.trim().length === 0 ||
      !/^[0-9a-f]{64}$/i.test(mediaDigest.trim()) ||
      size === null
    ) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    void recordMedia(
      client,
      product,
      sellerProfileId,
      {
        mediaReference: mediaReference.trim(),
        mediaDigest: mediaDigest.trim(),
        mimeType,
        sizeBytes: size,
      },
      setSaving,
      setNotice,
      onDone,
    );
  }

  return (
    // Custom validation surfaces the generic safe message; noValidate keeps
    // the browser's native pattern tooltip from blocking the submission.
    <form className="form" onSubmit={onSubmit} noValidate>
      <label>
        Media reference (opaque object-storage reference)
        <input
          value={mediaReference}
          onChange={(event) => {
            setMediaReference(event.target.value);
          }}
          required
          minLength={1}
          maxLength={1024}
        />
      </label>
      <label>
        SHA-256 digest
        <input
          value={mediaDigest}
          onChange={(event) => {
            setMediaDigest(event.target.value);
          }}
          required
          pattern="^[0-9a-f]{64}$"
          title="64-character lowercase hexadecimal SHA-256 digest"
        />
      </label>
      <label>
        MIME type
        <select
          value={mimeType}
          onChange={(event) => {
            setMimeType(event.target.value as 'image/jpeg' | 'image/png' | 'image/webp');
          }}
        >
          <option value="image/jpeg">image/jpeg</option>
          <option value="image/png">image/png</option>
          <option value="image/webp">image/webp</option>
        </select>
      </label>
      <label>
        Size (bytes, ≤ 10 MB)
        <input
          value={sizeBytes}
          onChange={(event) => {
            setSizeBytes(event.target.value);
          }}
          required
          inputMode="numeric"
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Record media
        </button>
      </div>
      {notice}
    </form>
  );
}

async function recordMedia(
  client: SellerApiClient,
  product: ProductDetailResult,
  sellerProfileId: string,
  values: {
    readonly mediaReference: string;
    readonly mediaDigest: string;
    readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    readonly sizeBytes: number;
  },
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
  onDone: () => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.recordMedia({
      productId: product.productId,
      sellerProfileId,
      expectedVersion: product.version,
      ...values,
    });
    setNotice(
      <div className="notice" role="status">
        Media recorded.
      </div>,
    );
    onDone();
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle actions (submit / close / edit) — server authoritative
// ---------------------------------------------------------------------------

function ProductLifecycleActions({
  product,
  sellerProfileId,
  onChanged,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
  readonly onChanged: () => void;
}): ReactNode {
  const client = useSellerApi();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  const canEdit = SELLER_EDITABLE_STATES.includes(product.state);
  const canSubmit = SELLER_SUBMITTABLE_STATES.includes(product.state);
  const canClose = SELLER_CLOSEABLE_STATES.includes(product.state);

  function submit(): void {
    void submitProduct(client, product, sellerProfileId, setSaving, setNotice, onChanged);
  }

  return (
    <div className="panel-sub">
      <h3>Actions</h3>
      <div className="actions">
        {canEdit && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEditing((current) => !current);
            }}
          >
            {editing ? 'Close editor' : 'Edit'}
          </button>
        )}
        {canSubmit && (
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            Submit for review
          </button>
        )}
        {canClose && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setClosing((current) => !current);
            }}
          >
            {closing ? 'Close' : 'Close product'}
          </button>
        )}
      </div>
      {editing && (
        <ProductEditForm
          product={product}
          sellerProfileId={sellerProfileId}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
      {closing && (
        <CloseProductForm
          product={product}
          sellerProfileId={sellerProfileId}
          onDone={() => {
            setClosing(false);
            onChanged();
          }}
        />
      )}
      {notice}
    </div>
  );
}

async function submitProduct(
  client: SellerApiClient,
  product: ProductDetailResult,
  sellerProfileId: string,
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
  onChanged: () => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.submitProduct({
      productId: product.productId,
      sellerProfileId,
      expectedVersion: product.version,
    });
    setNotice(
      <div className="notice" role="status">
        Product submitted for review.
      </div>,
    );
    onChanged();
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

function ProductEditForm({
  product,
  sellerProfileId,
  onSaved,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
  readonly onSaved: () => void;
}): ReactNode {
  const client = useSellerApi();
  const loadCategories = useCallback(() => client.listCategories(), [client]);
  const categoriesState = useAsync(loadCategories, [loadCategories]);
  const [name, setName] = useState(product.name);
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [sellingPrice, setSellingPrice] = useState(String(product.sellingPrice));
  const [compareAtPrice, setCompareAtPrice] = useState(
    product.compareAtPrice === undefined ? '' : String(product.compareAtPrice),
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const price = parsePrice(sellingPrice);
    if (price === null) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    let compare: number | undefined;
    if (compareAtPrice.trim().length > 0) {
      const parsedCompare = parsePrice(compareAtPrice);
      if (parsedCompare === null) {
        setNotice(<ErrorNotice kind="VALIDATION" />);
        return;
      }
      compare = parsedCompare;
    }
    void updateProduct(
      client,
      product,
      sellerProfileId,
      {
        name: name.trim(),
        categoryId,
        sellingPrice: price,
        ...(compare === undefined ? {} : { compareAtPrice: compare }),
      },
      setSaving,
      setNotice,
      onSaved,
    );
  }

  if (categoriesState.status === 'loading') return <p className="notice">Loading…</p>;
  if (categoriesState.status === 'error') return <ErrorNotice kind={categoriesState.kind} />;
  const categories = categoriesState.data.filter((category) => category.state === 'ACTIVE');

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <label>
        Name
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          required
          minLength={1}
          maxLength={256}
        />
      </label>
      <label>
        Category
        <select
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
          }}
          required
        >
          {categories.map((category) => (
            <option key={category.categoryId} value={category.categoryId}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Selling price (INR)
        <input
          value={sellingPrice}
          onChange={(event) => {
            setSellingPrice(event.target.value);
          }}
          required
          inputMode="decimal"
        />
      </label>
      <label>
        Compare-at price (INR, optional)
        <input
          value={compareAtPrice}
          onChange={(event) => {
            setCompareAtPrice(event.target.value);
          }}
          inputMode="decimal"
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Save changes
        </button>
      </div>
      {notice}
    </form>
  );
}

async function updateProduct(
  client: SellerApiClient,
  product: ProductDetailResult,
  sellerProfileId: string,
  values: {
    readonly name: string;
    readonly categoryId: string;
    readonly sellingPrice: number;
    readonly compareAtPrice?: number;
  },
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
  onSaved: () => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.updateProduct({
      productId: product.productId,
      sellerProfileId,
      expectedVersion: product.version,
      ...values,
    });
    setNotice(
      <div className="notice" role="status">
        Product updated.
      </div>,
    );
    onSaved();
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

function CloseProductForm({
  product,
  sellerProfileId,
  onDone,
}: {
  readonly product: ProductDetailResult;
  readonly sellerProfileId: string;
  readonly onDone: () => void;
}): ReactNode {
  const client = useSellerApi();
  const [reasonReference, setReasonReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (reasonReference.trim().length === 0) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    void closeProduct(
      client,
      product,
      sellerProfileId,
      reasonReference.trim(),
      setSaving,
      setNotice,
      onDone,
    );
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <label>
        Reason reference (required)
        <input
          value={reasonReference}
          onChange={(event) => {
            setReasonReference(event.target.value);
          }}
          required
          minLength={1}
          maxLength={512}
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Close product
        </button>
      </div>
      {notice}
    </form>
  );
}

async function closeProduct(
  client: SellerApiClient,
  product: ProductDetailResult,
  sellerProfileId: string,
  reasonReference: string,
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
  onDone: () => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.closeProduct({
      productId: product.productId,
      sellerProfileId,
      expectedVersion: product.version,
      reasonReference,
    });
    setNotice(
      <div className="notice" role="status">
        Product closed.
      </div>,
    );
    onDone();
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

// ---------------------------------------------------------------------------
// Category taxonomy (read-only, platform-defined — §6, decision D-03)
// ---------------------------------------------------------------------------

export function CategoriesPanel(): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.listCategories(), [client]);
  const state = useAsync(load, [load]);
  return (
    <div className="panel">
      <h2>Categories</h2>
      <p className="muted">
        Platform-defined taxonomy. Category management is not available in this phase.
      </p>
      <AsyncBoundary
        state={state}
        empty={(categories) =>
          categories.length === 0 ? <EmptyNotice>No categories available.</EmptyNotice> : null
        }
      >
        {(categories: readonly CategorySummary[]) => (
          <ul className="plain-list">
            {categories
              .filter((category) => category.state === 'ACTIVE')
              .map((category) => (
                <li key={category.categoryId}>
                  {category.name}
                  {category.parentCategoryId !== undefined && (
                    <span className="muted"> (sub-category)</span>
                  )}
                </li>
              ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}

function parsePrice(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1000000) return null;
  const fraction = value.split('.')[1];
  if (fraction !== undefined && fraction.length > 2) return null;
  return Math.round(parsed * 100) / 100;
}

function parseSize(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10 * 1024 * 1024) return null;
  return parsed;
}
