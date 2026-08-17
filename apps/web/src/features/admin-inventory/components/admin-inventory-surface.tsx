'use client';

import { useCallback, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import type {
  AdminInventoryDetailResult,
  InventoryListEntry,
  InventoryMovementEntry,
  SellerApiClient,
  SellerApiErrorKind,
  ThresholdConfigResult,
} from '@/src/lib/seller-api';
import { SellerApiError } from '@/src/lib/seller-api';
import { useSellerApi } from '../../seller/seller-api-provider';
import { AsyncBoundary, EmptyNotice, ErrorNotice } from '../../seller/components/async';
import { useAsync } from '../../seller/components/async';
import { formatDate } from '../../seller/components/status-display';
import { StockLabelBadge } from '../../inventory/components/inventory-surface';

function toKind(error: unknown): SellerApiErrorKind {
  return error instanceof SellerApiError ? error.kind : 'SERVER';
}

// ---------------------------------------------------------------------------
// Module 05 — Admin inventory (WEMP-M05-SPEC-001 §15, M05-M5). Read routes
// require inventory.audit.view; corrections require inventory.adjust.admin
// and a mandatory reason reference; configuration is admin-managed and
// version-checked (D-14). The server enforces all grants — this UI renders
// server data and generic, non-disclosing error states.
// ---------------------------------------------------------------------------

export function AdminInventoryList({
  onSelect,
}: {
  readonly onSelect: (skuId: string) => void;
}): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.adminListInventory(), [client]);
  const state = useAsync(load, [load]);
  return (
    <div className="panel">
      <h2>Inventory</h2>
      <AsyncBoundary
        state={state}
        empty={(entries) =>
          entries.length === 0 ? <EmptyNotice>No stock pools found.</EmptyNotice> : null
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

export function AdminInventoryDetail({
  skuId,
  onBack,
}: {
  readonly skuId: string;
  readonly onBack: () => void;
}): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.adminGetSkuDetail(skuId), [client, skuId]);
  const state = useAsync(load, [load]);
  const [correcting, setCorrecting] = useState(false);

  return (
    <div className="panel">
      <h2>SKU inventory detail</h2>
      <AsyncBoundary state={state}>
        {(detail: AdminInventoryDetailResult) => (
          <>
            <div className="muted detail-list">
              <p>SKU: {detail.skuId}</p>
              <p>Seller: {detail.sellerProfileId}</p>
              <p>
                Stock: <StockLabelBadge label={detail.label} /> — {detail.available} available (
                {detail.onHand} on hand, {detail.reserved} reserved)
              </p>
              <p>Version: {detail.version}</p>
            </div>
            <div className="panel-sub">
              <h3>Movement history</h3>
              {detail.movements.length === 0 ? (
                <EmptyNotice>No movements recorded.</EmptyNotice>
              ) : (
                <MovementList movements={detail.movements} />
              )}
            </div>
            <div className="panel-sub">
              <h3>Audit records</h3>
              {detail.audit.length === 0 ? (
                <EmptyNotice>No audit records.</EmptyNotice>
              ) : (
                <ul className="plain-list">
                  {detail.audit.map((record) => (
                    <li key={`${record.eventType}-${record.occurredAt}`}>
                      {record.eventType}
                      <span className="muted"> — {formatDate(record.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setCorrecting((current) => !current);
                }}
              >
                {correcting ? 'Close correction form' : 'Correct stock'}
              </button>
            </div>
            {correcting && <CorrectionForm skuId={skuId} expectedVersion={detail.version} />}
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

function MovementList({
  movements,
}: {
  readonly movements: readonly InventoryMovementEntry[];
}): ReactNode {
  return (
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
  );
}

function CorrectionForm({
  skuId,
  expectedVersion,
}: {
  readonly skuId: string;
  readonly expectedVersion: number;
}): ReactNode {
  const client = useSellerApi();
  const [targetOnHand, setTargetOnHand] = useState('0');
  const [reasonReference, setReasonReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void performCorrection(
      client,
      { skuId, targetOnHand: Number(targetOnHand), expectedVersion, reasonReference },
      setSaving,
      setNotice,
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        Target on-hand quantity
        <input
          type="number"
          min={0}
          required
          value={targetOnHand}
          onChange={(event) => {
            setTargetOnHand(event.target.value);
          }}
        />
      </label>
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
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Applying…' : 'Apply correction'}
        </button>
      </div>
      {notice}
    </form>
  );
}

async function performCorrection(
  client: SellerApiClient,
  input: Parameters<SellerApiClient['adminCorrectStock']>[0],
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    const result = await client.adminCorrectStock(input);
    setNotice(
      <div className="notice" role="status">
        Correction applied — {result.available} available now.
      </div>,
    );
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

// ---------------------------------------------------------------------------
// Threshold configuration (D-14, admin-managed, never seller-configurable)
// ---------------------------------------------------------------------------

export function AdminThresholdConfigPanel(): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.adminGetThresholdConfig(), [client]);
  const state = useAsync(load, [load]);
  const [editing, setEditing] = useState(false);

  return (
    <div className="panel">
      <h2>Inventory thresholds</h2>
      <AsyncBoundary state={state}>
        {(config: ThresholdConfigResult) => (
          <>
            <div className="muted detail-list">
              <p>Low-stock threshold: {config.lowStockThreshold}</p>
              <p>Out-of-stock threshold: {config.outOfStockThreshold}</p>
              <p>Version: {config.version}</p>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setEditing((current) => !current);
                }}
              >
                {editing ? 'Close form' : 'Update thresholds'}
              </button>
            </div>
            {editing && <ThresholdConfigForm current={config} />}
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}

function ThresholdConfigForm({ current }: { readonly current: ThresholdConfigResult }): ReactNode {
  const client = useSellerApi();
  const [lowStockThreshold, setLowStockThreshold] = useState(String(current.lowStockThreshold));
  const [outOfStockThreshold, setOutOfStockThreshold] = useState(
    String(current.outOfStockThreshold),
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void performThresholdUpdate(
      client,
      {
        lowStockThreshold: Number(lowStockThreshold),
        outOfStockThreshold: Number(outOfStockThreshold),
        expectedVersion: current.version,
      },
      setSaving,
      setNotice,
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        Low-stock threshold
        <input
          type="number"
          min={0}
          required
          value={lowStockThreshold}
          onChange={(event) => {
            setLowStockThreshold(event.target.value);
          }}
        />
      </label>
      <label>
        Out-of-stock threshold
        <input
          type="number"
          min={0}
          required
          value={outOfStockThreshold}
          onChange={(event) => {
            setOutOfStockThreshold(event.target.value);
          }}
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save thresholds'}
        </button>
      </div>
      {notice}
    </form>
  );
}

async function performThresholdUpdate(
  client: SellerApiClient,
  input: Parameters<SellerApiClient['adminUpdateThresholdConfig']>[0],
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    const result = await client.adminUpdateThresholdConfig(input);
    setNotice(
      <div className="notice" role="status">
        Thresholds updated — version {result.version}.
      </div>,
    );
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}
