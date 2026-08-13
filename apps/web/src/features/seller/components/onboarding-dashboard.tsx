'use client';

import { useCallback, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import type { OnboardingStatus, SellerApiClient, SellerApiErrorKind } from '@/src/lib/seller-api';
import { SellerApiError } from '@/src/lib/seller-api';
import { useSellerApi } from '../seller-api-provider';
import { ErrorNotice, LoadingNotice } from './async';
import { useAsync } from './async';
import {
  COMPLIANCE_STATE_LABELS,
  formatDate,
  SellerStateBadge,
  VERIFICATION_TYPE_LABELS,
} from './status-display';

interface OnboardingDashboardProps {
  readonly onNavigate?: (path: string) => void;
}

/**
 * M03-M6 seller dashboard. The server is authoritative: this component renders
 * whatever state `GET /seller/onboarding` reports and never infers access. The
 * pre-approval flow (create/submit/correct) and the post-approval surface
 * (profile/verification/warehouses/agreements/members) are all rendered from
 * the same status payload.
 */
export function OnboardingDashboard({ onNavigate }: OnboardingDashboardProps): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.getOnboardingStatus(), [client]);
  const [reloadKey, setReloadKey] = useState(0);
  const state = useAsync(load, [load, reloadKey]);
  const [createMode, setCreateMode] = useState(false);

  if (state.status === 'loading') return <LoadingNotice />;
  if (state.status === 'error') {
    // A missing seller association is reported by the server as a 404 — this
    // is the only situation in which the client may offer to create one.
    if (state.kind === 'NOT_FOUND') {
      return createMode ? (
        <OnboardingCreateForm />
      ) : (
        <OnboardingCreatePrompt
          onStart={() => {
            setCreateMode(true);
          }}
        />
      );
    }
    return <ErrorNotice kind={state.kind} />;
  }

  const status = state.data;
  return status.state === 'DRAFT' || status.state === 'CORRECTIONS_REQUESTED' ? (
    <PreApprovalView
      status={status}
      onChanged={() => {
        setReloadKey((current) => current + 1);
      }}
    />
  ) : (
    <StatusView status={status} {...(onNavigate === undefined ? {} : { onNavigate })} />
  );
}

function OnboardingCreatePrompt({ onStart }: { readonly onStart: () => void }): ReactNode {
  return (
    <div className="panel">
      <h2>Start seller onboarding</h2>
      <p className="muted">
        You are not yet associated with a seller profile. Begin onboarding to request a seller
        profile for your business.
      </p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onStart}>
          Start onboarding
        </button>
      </div>
    </div>
  );
}

function OnboardingCreateForm(): ReactNode {
  const client = useSellerApi();
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void createOnboarding(
      client,
      { legalName, tradeName, registrationNumber, businessAddress },
      setSaving,
      setNotice,
    );
  }

  return (
    <div className="panel">
      <h2>Business details</h2>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Legal name
          <input
            value={legalName}
            onChange={(event) => {
              setLegalName(event.target.value);
            }}
            required
            minLength={1}
            maxLength={256}
            autoComplete="organization"
          />
        </label>
        <label>
          Trade name
          <input
            value={tradeName}
            onChange={(event) => {
              setTradeName(event.target.value);
            }}
            required
            minLength={1}
            maxLength={256}
            autoComplete="organization"
          />
        </label>
        <label>
          Registration number
          <input
            value={registrationNumber}
            onChange={(event) => {
              setRegistrationNumber(event.target.value);
            }}
            required
            minLength={1}
            maxLength={64}
            autoComplete="off"
          />
          <span className="hint">
            Used only to prevent duplicate registrations; never displayed.
          </span>
        </label>
        <label>
          Business address
          <input
            value={businessAddress}
            onChange={(event) => {
              setBusinessAddress(event.target.value);
            }}
            required
            minLength={1}
            maxLength={512}
            autoComplete="street-address"
          />
        </label>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            Create onboarding
          </button>
        </div>
        {notice}
      </form>
    </div>
  );
}

async function createOnboarding(
  client: SellerApiClient,
  values: {
    readonly legalName: string;
    readonly tradeName: string;
    readonly registrationNumber: string;
    readonly businessAddress: string;
  },
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.createOnboarding(values);
    setNotice(
      <div className="notice" role="status">
        Onboarding created.
      </div>,
    );
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

/**
 * Pre-approval view: the seller exists in DRAFT or CORRECTIONS_REQUESTED.
 * Editing and submission go through the M03-M5 API; the client never selects a
 * lifecycle transition — the server dispatches resubmission when required.
 */
function PreApprovalView({
  status,
  onChanged,
}: {
  readonly status: OnboardingStatus;
  /** Called after a successful submission so the parent refetches the status. */
  readonly onChanged: () => void;
}): ReactNode {
  const client = useSellerApi();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  return (
    <div className="panel">
      <h2>Onboarding in progress</h2>
      <p>
        Status: <SellerStateBadge state={status.state} />
      </p>
      <p className="muted">Compliance: {COMPLIANCE_STATE_LABELS[status.complianceState]}</p>
      {status.state === 'CORRECTIONS_REQUESTED' && (
        <div className="notice" role="status">
          An administrator requested corrections. Review your details, update them, and resubmit.
        </div>
      )}
      <div className="muted detail-list">
        <p>Legal name: {status.organization.legalName}</p>
        <p>Trade name: {status.organization.tradeName}</p>
        <p>Business address: {status.organization.businessAddress}</p>
        {status.submittedAt !== undefined && <p>Submitted: {formatDate(status.submittedAt)}</p>}
      </div>

      {status.verifications.length > 0 && (
        <div>
          <h3>Verification summary</h3>
          <ul className="plain-list">
            {status.verifications.map((item) => (
              <li key={`${item.verificationType}-${String(item.generation)}`}>
                {VERIFICATION_TYPE_LABELS[item.verificationType]}: {item.state}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setEditing((current) => !current);
          }}
        >
          {editing ? 'Close editor' : 'Edit details'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting}
          onClick={() => {
            void submitOnboarding(status, client, setSubmitting, setNotice, onChanged);
          }}
        >
          {status.state === 'CORRECTIONS_REQUESTED' ? 'Resubmit for review' : 'Submit for review'}
        </button>
      </div>

      {editing && (
        <EditDetailsForm
          status={status}
          onSaved={() => {
            setEditing(false);
          }}
        />
      )}
      {notice}
    </div>
  );
}

async function submitOnboarding(
  status: OnboardingStatus,
  client: SellerApiClient,
  setSubmitting: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
  onChanged: () => void,
): Promise<void> {
  setSubmitting(true);
  try {
    await client.submitOnboarding({
      sellerProfileId: status.sellerProfileId,
      expectedVersion: status.version,
    });
    setNotice(
      <div className="notice" role="status">
        Submitted for review.
      </div>,
    );
    // The server dispatched the transition — refetch so the view reflects the
    // new lifecycle state instead of guessing it client-side.
    onChanged();
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSubmitting(false);
  }
}

function EditDetailsForm({
  status,
  onSaved,
}: {
  readonly status: OnboardingStatus;
  readonly onSaved: () => void;
}): ReactNode {
  const client = useSellerApi();
  const [legalName, setLegalName] = useState(status.organization.legalName);
  const [tradeName, setTradeName] = useState(status.organization.tradeName);
  const [businessAddress, setBusinessAddress] = useState(status.organization.businessAddress);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSave(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void saveDetails(
      client,
      status,
      { legalName, tradeName, businessAddress },
      setSaving,
      setNotice,
      onSaved,
    );
  }

  return (
    <form className="form" onSubmit={onSave}>
      <label>
        Legal name
        <input
          value={legalName}
          onChange={(event) => {
            setLegalName(event.target.value);
          }}
          required
          minLength={1}
          maxLength={256}
        />
      </label>
      <label>
        Trade name
        <input
          value={tradeName}
          onChange={(event) => {
            setTradeName(event.target.value);
          }}
          required
          minLength={1}
          maxLength={256}
        />
      </label>
      <label>
        Business address
        <input
          value={businessAddress}
          onChange={(event) => {
            setBusinessAddress(event.target.value);
          }}
          required
          minLength={1}
          maxLength={512}
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

async function saveDetails(
  client: SellerApiClient,
  status: OnboardingStatus,
  values: {
    readonly legalName: string;
    readonly tradeName: string;
    readonly businessAddress: string;
  },
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
  onSaved: () => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.updateProfile({
      sellerProfileId: status.sellerProfileId,
      expectedVersion: status.version,
      legalName: values.legalName,
      tradeName: values.tradeName,
      businessAddress: values.businessAddress,
    });
    setNotice(
      <div className="notice" role="status">
        Details saved.
      </div>,
    );
    onSaved();
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

/** Post-submission status views for the seller lifecycle. */
function StatusView({
  status,
  onNavigate,
}: {
  readonly status: OnboardingStatus;
  readonly onNavigate?: (path: string) => void;
}): ReactNode {
  switch (status.state) {
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return (
        <div className="panel">
          <h2>Under review</h2>
          <p>
            Status: <SellerStateBadge state={status.state} />
          </p>
          <p className="muted">
            Your onboarding was submitted and is being reviewed. No further action is needed from
            you at this time.
          </p>
        </div>
      );
    case 'APPROVED':
      return (
        <div className="panel">
          <h2>Approved</h2>
          <p>
            Status: <SellerStateBadge state={status.state} />
          </p>
          <p className="muted">
            Your seller profile is approved. Access to seller capabilities is granted by the
            platform when your role is activated.
          </p>
        </div>
      );
    case 'ACTIVE':
      return (
        <ActiveDashboard status={status} {...(onNavigate === undefined ? {} : { onNavigate })} />
      );
    case 'SUSPENDED':
      return (
        <div className="panel">
          <h2>Suspended</h2>
          <p>
            Status: <SellerStateBadge state={status.state} />
          </p>
          <p className="muted">
            Your seller account is currently suspended. Contact the platform support team for
            assistance.
          </p>
        </div>
      );
    case 'REJECTED':
    case 'CLOSED':
      return (
        <div className="panel">
          <h2>Not active</h2>
          <p>
            Status: <SellerStateBadge state={status.state} />
          </p>
          <p className="muted">
            This seller profile is no longer active. If you believe this is an error, contact the
            platform support team.
          </p>
        </div>
      );
    default:
      return (
        <div className="panel">
          <p>
            Status: <SellerStateBadge state={status.state} />
          </p>
        </div>
      );
  }
}

function ActiveDashboard({
  status,
  onNavigate,
}: {
  readonly status: OnboardingStatus;
  readonly onNavigate?: (path: string) => void;
}): ReactNode {
  const sections: readonly { readonly path: string; readonly label: string }[] = [
    { path: '/seller/profile', label: 'Profile' },
    { path: '/seller/verification', label: 'Verification status' },
    { path: '/seller/warehouses', label: 'Warehouses' },
    { path: '/seller/agreements', label: 'Agreements' },
    { path: '/seller/members', label: 'Members' },
  ];
  return (
    <div className="panel">
      <h2>Active seller</h2>
      <p>
        Status: <SellerStateBadge state={status.state} />
      </p>
      <p className="muted">Compliance: {COMPLIANCE_STATE_LABELS[status.complianceState]}</p>
      <ul className="plain-list">
        {sections.map((section) => (
          <li key={section.path}>
            {onNavigate === undefined ? (
              <span>{section.label}</span>
            ) : (
              <button
                type="button"
                className="link"
                onClick={() => {
                  onNavigate(section.path);
                }}
              >
                {section.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function toKind(error: unknown): SellerApiErrorKind {
  return error instanceof SellerApiError ? error.kind : 'SERVER';
}
