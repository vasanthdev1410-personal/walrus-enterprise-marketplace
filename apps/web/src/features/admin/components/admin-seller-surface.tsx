'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AdminReviewAction,
  EvidenceMetadataEntry,
  OwnProfile,
  SellerApiClient,
  SellerApiErrorKind,
  SellerState,
} from '@/src/lib/seller-api';
import { SellerApiError } from '@/src/lib/seller-api';
import { useSellerApi } from '../../seller/seller-api-provider';
import { AsyncBoundary, EmptyNotice, ErrorNotice } from '../../seller/components/async';
import { useAsync } from '../../seller/components/async';
import {
  COMPLIANCE_STATE_LABELS,
  formatDate,
  SellerStateBadge,
} from '../../seller/components/status-display';

function toKind(error: unknown): SellerApiErrorKind {
  return error instanceof SellerApiError ? error.kind : 'SERVER';
}

// ---------------------------------------------------------------------------
// Admin seller list (GET /admin/sellers)
// ---------------------------------------------------------------------------

export function AdminSellerList({
  onSelect,
}: {
  readonly onSelect: (sellerProfileId: string) => void;
}): ReactNode {
  const client = useSellerApi();
  const [stateFilter, setStateFilter] = useState<SellerState | undefined>(undefined);
  const load = useCallback(() => client.listSellers(stateFilter), [client, stateFilter]);
  const state = useAsync(load, [load]);
  return (
    <div className="panel">
      <h2>Sellers</h2>
      <label className="filter">
        State
        <select
          value={stateFilter ?? ''}
          onChange={(event) =>
            { setStateFilter(
              event.target.value === '' ? undefined : (event.target.value as SellerState),
            ); }
          }
        >
          <option value="">All</option>
          {(
            [
              'DRAFT',
              'SUBMITTED',
              'UNDER_REVIEW',
              'CORRECTIONS_REQUESTED',
              'APPROVED',
              'ACTIVE',
              'SUSPENDED',
              'REJECTED',
              'CLOSED',
            ] as const
          ).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <AsyncBoundary
        state={state}
        empty={(sellers) =>
          sellers.length === 0 ? <EmptyNotice>No sellers found.</EmptyNotice> : null
        }
      >
        {(sellers: readonly { sellerProfileId: string; state: SellerState }[]) => (
          <ul className="plain-list">
            {sellers.map((seller) => (
              <li key={seller.sellerProfileId}>
                <button
                  type="button"
                  className="link"
                  onClick={() => { onSelect(seller.sellerProfileId); }}
                >
                  <SellerStateBadge state={seller.state} />{' '}
                  <span className="id">{seller.sellerProfileId}</span>
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
// Admin seller detail + review/suspend/reactivate
// ---------------------------------------------------------------------------

export function AdminSellerDetail({
  sellerProfileId,
}: {
  readonly sellerProfileId: string;
}): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.getSellerDetail(sellerProfileId), [client, sellerProfileId]);
  const state = useAsync(load, [load]);
  return (
    <AsyncBoundary state={state}>
      {(seller: OwnProfile) => (
        <div className="panel">
          <h2>Seller {seller.sellerProfileId}</h2>
          <p>
            Status: <SellerStateBadge state={seller.state} />
          </p>
          <p className="muted">
            Compliance: {COMPLIANCE_STATE_LABELS[seller.complianceState]}
          </p>
          <div className="muted detail-list">
            <p>Legal name: {seller.organization.legalName}</p>
            <p>Trade name: {seller.organization.tradeName}</p>
            <p>Business address: {seller.organization.businessAddress}</p>
            <p>Version: {seller.version}</p>
          </div>
          <ReviewActions seller={seller} />
          <SuspendActions seller={seller} />
          <EvidenceMetadata sellerProfileId={sellerProfileId} />
        </div>
      )}
    </AsyncBoundary>
  );
}

const REVIEW_ACTIONS: readonly {
  readonly action: AdminReviewAction;
  readonly label: string;
  readonly requiresReason: boolean;
}[] = [
  { action: 'CLAIM_REVIEW', label: 'Claim review', requiresReason: false },
  { action: 'REQUEST_CORRECTIONS', label: 'Request corrections', requiresReason: true },
  { action: 'APPROVE', label: 'Approve', requiresReason: false },
  { action: 'REJECT', label: 'Reject', requiresReason: true },
];

function ReviewActions({ seller }: { readonly seller: OwnProfile }): ReactNode {
  const client = useSellerApi();
  const [notice, setNotice] = useState<ReactNode>(null);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');

  function run(action: AdminReviewAction, requiresReason: boolean): void {
    if (requiresReason && reason.trim().length === 0) {
      setNotice(
        <ErrorNotice kind="VALIDATION" />,
      );
      return;
    }
    void review(
      client,
      seller,
      action,
      requiresReason ? reason : undefined,
      setSaving,
      setNotice,
    );
  }

  return (
    <div className="panel-sub">
      <h3>Review</h3>
      <div className="actions">
        {REVIEW_ACTIONS.map((entry) => (
          <button
            key={entry.action}
            type="button"
            className="btn"
            disabled={saving}
            onClick={() => { run(entry.action, entry.requiresReason); }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <label className="form">
        Reason (required for corrections / reject)
        <input
          value={reason}
          onChange={(event) => { setReason(event.target.value); }}
          maxLength={256}
        />
      </label>
      {notice}
    </div>
  );
}

async function review(
  client: SellerApiClient,
  seller: OwnProfile,
  action: AdminReviewAction,
  reasonReference: string | undefined,
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.reviewSeller({
      sellerProfileId: seller.sellerProfileId,
      action,
      expectedVersion: seller.version,
      ...(reasonReference === undefined ? {} : { reasonReference }),
    });
    setNotice(<div className="notice" role="status">Review decision recorded.</div>);
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

function SuspendActions({ seller }: { readonly seller: OwnProfile }): ReactNode {
  const client = useSellerApi();
  const [notice, setNotice] = useState<ReactNode>(null);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');

  function suspend(): void {
    if (reason.trim().length === 0) {
      setNotice(<ErrorNotice kind="VALIDATION" />);
      return;
    }
    void suspendSeller(client, seller, reason, setSaving, setNotice);
  }

  function reactivate(): void {
    void reactivateSeller(client, seller, setSaving, setNotice);
  }

  return (
    <div className="panel-sub">
      <h3>Account state</h3>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={saving || seller.state !== 'ACTIVE'}
          onClick={suspend}
        >
          Suspend
        </button>
        <button
          type="button"
          className="btn"
          disabled={saving || seller.state !== 'SUSPENDED'}
          onClick={reactivate}
        >
          Reactivate
        </button>
      </div>
      <label className="form">
        Reason (required for suspension)
        <input
          value={reason}
          onChange={(event) => { setReason(event.target.value); }}
          maxLength={256}
        />
      </label>
      {notice}
    </div>
  );
}

async function suspendSeller(
  client: SellerApiClient,
  seller: OwnProfile,
  reasonReference: string,
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.suspendSeller({
      sellerProfileId: seller.sellerProfileId,
      expectedVersion: seller.version,
      reasonReference,
    });
    setNotice(<div className="notice" role="status">Seller suspended.</div>);
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

async function reactivateSeller(
  client: SellerApiClient,
  seller: OwnProfile,
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.reactivateSeller({
      sellerProfileId: seller.sellerProfileId,
      expectedVersion: seller.version,
    });
    setNotice(<div className="notice" role="status">Seller reactivated.</div>);
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

// ---------------------------------------------------------------------------
// Evidence metadata (admin-only; metadata only — never content)
// ---------------------------------------------------------------------------

function EvidenceMetadata({
  sellerProfileId,
}: {
  readonly sellerProfileId: string;
}): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.getEvidenceMetadata(sellerProfileId), [client, sellerProfileId]);
  const state = useAsync(load, [load]);
  return (
    <div className="panel-sub">
      <h3>Evidence metadata</h3>
      <p className="muted">
        Metadata only — document contents are never shown.
      </p>
      <AsyncBoundary state={state}>
        {(evidence: readonly EvidenceMetadataEntry[]) =>
          evidence.length === 0 ? (
            <EmptyNotice>No evidence records.</EmptyNotice>
          ) : (
            <ul className="plain-list">
              {evidence.map((item) => (
                <li key={item.evidenceId}>
                  {item.evidenceType} ({item.verificationType}, {item.verificationState})
                  <span className="muted">
                    {' '}
                    — uploaded {formatDate(item.uploadedAt)}, digest{' '}
                    {item.evidenceDigest.slice(0, 12)}…
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
