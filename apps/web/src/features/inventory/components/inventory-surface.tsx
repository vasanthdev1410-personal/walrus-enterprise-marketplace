'use client';

import { useCallback, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import type {
  InventoryAdjustResult,
  InventoryListEntry,
  InventoryMovementEntry,
  InventoryMovementType,
  InventoryStockLabel,
  SellerApiClient,
  SellerApiErrorKind,
} from '@/src/lib/seller-api';
import { SellerApiError } from '@/src/lib/seller-api';
import { useSellerApi } from '../../seller/seller-api-provider';
import {
  AsyncBoundary,
  EmptyNotice,
  ErrorNotice,
  LoadingNotice,
} from '../../seller/components/async';
import { useAsync } from '../../seller/components/async';
import { formatDate } from '../../seller/components/status-display';

function toKind(error: unknown): SellerApiErrorKind {
  return error instanceof SellerApiError ? error.kind : 'SERVER';
}

// ---------------------------------------------------------------------------
// Module 05 — Seller inventory (WEMP-M05-SPEC-001 §15, M05-M5). The server
// remains authoritative for ownership and authorization (inventory.read /
// inventory.adjust.self through the Module 02 engine + the seller ownership
// resolver); this UI renders server data and surfaces generic, non-disclosing
// error states. Mutations carry an Idempotency-Key and the current version
// (optimistic concurrency).
// ---------------------------------------------------------------------------

export const INVENTORY_LABEL_TEXT: Readonly<Record<InventoryStockLabel, string>> = {
  IN_STOCK: 'In stock',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
};

export function InventoryPanel(): ReactNode {
  const client = useSellerApi();
  const loadProfile = useCallback(() => client.getProfile(), [client]);
  const profileState = useAsync(loadProfile, [loadProfile]);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);

  if (profileState.status === 'loading') return <LoadingNotice />;
  if (profileState.status === 'error') return <ErrorNotice kind={profileState.kind} />;
  const sellerProfileId = profileState.data.sellerProfileId;

  if (selectedSkuId !== null) {
    return (
      <SkuInventoryDetail
        skuId={selectedSkuId}
        sellerProfileId={sellerProfileId}
        onBack={() => {
          setSelectedSkuId(null);
        }}
      />
    );
  }

  return (
    <InventoryList
      sellerProfileId={sellerProfileId}
      onSelect={(skuId) => {
        setSelectedSkuId(skuId);
      }}
    />
  );
}

function InventoryList({
  sellerProfileId,
  onSelect,
}: {
  readonly sellerProfileId: string;
  readonly onSelect: (skuId: string) => void;
}): ReactNode {
  const client = useSellerApi();
  const load = useCallback(
    () => client.listOwnInventory(sellerProfileId),
    [client, sellerProfileId],
  );
  const state = useAsync(load, [load]);

  return (
    <div className="panel">
      <h2>Inventory</h2>
      <AsyncBoundary
        state={state}
        empty={(entries) =>
          entries.length === 0 ? <EmptyNotice>No inventory records yet.</EmptyNotice> : null
        }
      >
        {(entries: readonly InventoryListEntry[]) => (
          <ul className="plain-list">
            {entries.map((entry) => (
              <li key={entry.skuId}>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    onSelect(entry.skuId);
                  }}
                >
                  {entry.skuId}
                </button>
                <StockLabelBadge label={entry.label} />
                <span className="muted">
                  {' '}
                  — {entry.available} available ({entry.onHand} on hand, {entry.reserved} reserved)
                </span>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}

function SkuInventoryDetail({
  skuId,
  sellerProfileId,
  onBack,
}: {
  readonly skuId: string;
  readonly sellerProfileId: string;
  readonly onBack: () => void;
}): ReactNode {
  const client = useSellerApi();
  const load = useCallback(
    () => client.getOwnSkuDetail(skuId, sellerProfileId),
    [client, skuId, sellerProfileId],
  );
  const state = useAsync(load, [load]);
  const [adjusting, setAdjusting] = useState(false);

  return (
    <div className="panel">
      <h2>SKU inventory</h2>
      <AsyncBoundary state={state}>
        {(entry: InventoryListEntry) => (
          <>
            <div className="muted detail-list">
              <p>SKU: {entry.skuId}</p>
              <p>
                Stock: <StockLabelBadge label={entry.label} /> — {entry.available} available (
                {entry.onHand} on hand, {entry.reserved} reserved)
              </p>
              <p>Version: {entry.version}</p>
            </div>
            <MovementLedger skuId={skuId} sellerProfileId={sellerProfileId} />
            <div className="actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setAdjusting((current) => !current);
                }}
              >
                {adjusting ? 'Close adjustment form' : 'Adjust stock'}
              </button>
            </div>
            {adjusting && (
              <AdjustmentForm
                skuId={skuId}
                sellerProfileId={sellerProfileId}
                expectedVersion={entry.version}
              />
            )}
          </>
        )}
      </AsyncBoundary>
      <div className="actions">
        <button type="button" className="btn" onClick={onBack}>
          Back to inventory list
        </button>
      </div>
    </div>
  );
}

function MovementLedger({
  skuId,
  sellerProfileId,
}: {
  readonly skuId: string;
  readonly sellerProfileId: string;
}): ReactNode {
  const client = useSellerApi();
  const load = useCallback(
    () => client.getOwnMovementLedger(skuId, sellerProfileId),
    [client, skuId, sellerProfileId],
  );
  const state = useAsync(load, [load]);

  return (
    <div className="panel-sub">
      <h3>Movement history</h3>
      <AsyncBoundary
        state={state}
        empty={(movements) =>
          movements.length === 0 ? <EmptyNotice>No movements recorded.</EmptyNotice> : null
        }
      >
        {(movements: readonly InventoryMovementEntry[]) => (
          <ul className="plain-list">
            {movements.map((movement) => (
              <li key={movement.movementId}>
                {movement.movementType}{' '}
                {movement.delta > 0 ? `+${movement.delta.toString()}` : movement.delta}
                <span className="muted">
                  {' '}
                  → on hand {movement.resultingOnHand} · {formatDate(movement.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}

function AdjustmentForm({
  skuId,
  sellerProfileId,
  expectedVersion,
}: {
  readonly skuId: string;
  readonly sellerProfileId: string;
  readonly expectedVersion: number;
}): ReactNode {
  const client = useSellerApi();
  const [movementType, setMovementType] = useState<InventoryMovementType>('STOCK_IN');
  const [delta, setDelta] = useState('1');
  const [reasonReference, setReasonReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void performAdjustment(
      client,
      {
        skuId,
        sellerProfileId,
        movementType,
        delta: Number(delta),
        expectedVersion,
        ...(movementType === 'STOCK_IN' ? {} : { reasonReference }),
      },
      setSaving,
      setNotice,
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        Movement type
        <select
          value={movementType}
          onChange={(event) => {
            setMovementType(event.target.value as InventoryMovementType);
          }}
        >
          <option value="STOCK_IN">Stock in (increase)</option>
          <option value="STOCK_OUT">Stock out (decrease)</option>
          <option value="ADJUSTMENT">Adjustment</option>
        </select>
      </label>
      <label>
        Delta (1–1,000,000)
        <input
          type="number"
          min={1}
          max={1000000}
          required
          value={delta}
          onChange={(event) => {
            setDelta(event.target.value);
          }}
        />
      </label>
      {movementType !== 'STOCK_IN' && (
        <label>
          Reason reference (required)
          <input
            type="text"
            required
            maxLength={512}
            value={reasonReference}
            onChange={(event) => {
              setReasonReference(event.target.value);
            }}
          />
        </label>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Applying…' : 'Apply adjustment'}
        </button>
      </div>
      {notice}
    </form>
  );
}

async function performAdjustment(
  client: SellerApiClient,
  input: Parameters<SellerApiClient['adjustStock']>[0],
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    const result: InventoryAdjustResult = await client.adjustStock(input);
    setNotice(
      <div className="notice" role="status">
        Adjustment applied — {result.available} available now.
      </div>,
    );
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

export function StockLabelBadge({
  label,
}: {
  readonly label: InventoryStockLabel | undefined;
}): ReactNode {
  if (label === undefined) return <span className="badge">Unknown</span>;
  return (
    <span className={`badge badge-${label.toLowerCase()}`}>{INVENTORY_LABEL_TEXT[label]}</span>
  );
}
