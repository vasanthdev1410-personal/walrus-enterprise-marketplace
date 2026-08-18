'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AdminCustomerDetailResult,
  AdminCustomerListEntry,
  CustomerApiErrorKind,
  CustomerLifecycleAction,
} from '@/src/lib/customer-api';
import { CustomerApiError } from '@/src/lib/customer-api';
import { useCustomerApi } from '../../customer/customer-api-provider';
import { AsyncBoundary, EmptyNotice, ErrorNotice } from '../../seller/components/async';
import { useAsync } from '../../seller/components/async';
import { formatDate } from '../../seller/components/status-display';

function toKind(error: unknown): CustomerApiErrorKind {
  return error instanceof CustomerApiError ? error.kind : 'SERVER';
}

/** Coerces a form field value to a string, failing safe on non-string values. */
function formValue(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

// ---------------------------------------------------------------------------
// Module 06 — Admin customer management (WEMP-M06-SPEC-001 §14/§15, M06-M5).
// Read routes require customer.read / customer.audit.view; lifecycle actions
// require customer.lifecycle.manage and a mandatory reason reference (D-02).
// The server enforces all grants — this UI renders server data and generic,
// non-disclosing error states. Lifecycle mutations carry an Idempotency-Key
// and the current version (optimistic concurrency, D-11).
// ---------------------------------------------------------------------------

export function AdminCustomerList({
  onSelect,
}: {
  readonly onSelect: (customerProfileId: string) => void;
}): ReactNode {
  const client = useCustomerApi();
  const load = useCallback(() => client.adminListCustomers(), [client]);
  const state = useAsync(load, [load], toKind);
  return (
    <div className="panel">
      <h2>Customers</h2>
      <AsyncBoundary
        state={state}
        empty={(customers) =>
          customers.length === 0 ? <EmptyNotice>No customer profiles found.</EmptyNotice> : null
        }
      >
        {(customers: readonly AdminCustomerListEntry[]) => (
          <ul className="plain-list">
            {customers.map((customer) => (
              <li key={customer.customerProfileId}>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    onSelect(customer.customerProfileId);
                  }}
                >
                  {customer.customerProfileId}
                </button>
                <span className="badge">{customer.state}</span>
                <span className="muted">
                  {' '}
                  — v{customer.version} · {formatDate(customer.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}

export function AdminCustomerDetail({
  customerProfileId,
  onBack,
}: {
  readonly customerProfileId: string;
  readonly onBack: () => void;
}): ReactNode {
  const client = useCustomerApi();
  const load = useCallback(
    () => client.adminGetCustomerDetail(customerProfileId),
    [client, customerProfileId],
  );
  const state = useAsync(load, [load], toKind);
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function performLifecycle(action: CustomerLifecycleAction): void {
    const form = document.getElementById('lifecycle-form') as HTMLFormElement | null;
    if (form === null) return;
    const formData = new FormData(form);
    const reasonReference = formValue(formData.get('reasonReference'));
    if (reasonReference.length === 0) return;
    setActing(true);
    void client
      .adminApplyLifecycleAction({
        customerProfileId,
        action,
        reasonReference,
        expectedVersion: Number(formData.get('expectedVersion')),
      })
      .then((result) => {
        setNotice(
          <div className="notice" role="status">
            Customer {result.state.toLowerCase()}. Version {result.version}.
          </div>,
        );
      })
      .catch((error: unknown) => {
        setNotice(<ErrorNotice kind={toKind(error)} />);
      })
      .finally(() => {
        setActing(false);
      });
  }

  return (
    <div className="panel">
      <h2>Customer detail</h2>
      <AsyncBoundary state={state}>
        {(detail: AdminCustomerDetailResult) => (
          <>
            <div className="muted detail-list">
              <p>Customer: {detail.customerProfileId}</p>
              <p>Identity: {detail.identityId}</p>
              <p>State: {detail.state}</p>
              <p>Version: {detail.version}</p>
              <p>Created: {formatDate(detail.createdAt)}</p>
            </div>
            <div className="panel-sub">
              <h3>Audit trail</h3>
              {detail.audit.length === 0 ? (
                <EmptyNotice>No audit events recorded.</EmptyNotice>
              ) : (
                <ul className="plain-list">
                  {detail.audit.map((event) => (
                    <li key={event.auditEventId}>
                      {event.eventType} — {formatDate(event.occurredAt)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form
              id="lifecycle-form"
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <input type="hidden" name="expectedVersion" value={detail.version} />
              <label>
                Reason reference (required for lifecycle actions)
                <input type="text" name="reasonReference" required maxLength={512} />
              </label>
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  disabled={acting}
                  onClick={() => {
                    performLifecycle('SUSPEND');
                  }}
                >
                  Suspend
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={acting}
                  onClick={() => {
                    performLifecycle('REACTIVATE');
                  }}
                >
                  Reinstate
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={acting}
                  onClick={() => {
                    performLifecycle('CLOSE');
                  }}
                >
                  Close
                </button>
              </div>
            </form>
            {notice}
          </>
        )}
      </AsyncBoundary>
      <div className="actions">
        <button type="button" className="btn" onClick={onBack}>
          Back to customer list
        </button>
      </div>
    </div>
  );
}

export function AdminCustomerAudit({
  customerProfileId,
}: {
  readonly customerProfileId: string;
}): ReactNode {
  const client = useCustomerApi();
  const load = useCallback(
    () => client.adminGetCustomerAudit(customerProfileId),
    [client, customerProfileId],
  );
  const state = useAsync(load, [load], toKind);
  return (
    <div className="panel">
      <h2>Customer audit trail</h2>
      <AsyncBoundary
        state={state}
        empty={(audit) => (audit.length === 0 ? <EmptyNotice>No audit events.</EmptyNotice> : null)}
      >
        {(audit: readonly { auditEventId: string; eventType: string; occurredAt: string }[]) => (
          <ul className="plain-list">
            {audit.map((event) => (
              <li key={event.auditEventId}>
                {event.eventType} — {formatDate(event.occurredAt)}
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}
