'use client';

import { useCallback, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import type {
  BusinessInfo,
  OwnProfile,
  SellerApiClient,
  SellerApiErrorKind,
  VerificationStatus,
  WarehouseSummary,
} from '@/src/lib/seller-api';
import { SellerApiError } from '@/src/lib/seller-api';
import { useSellerApi } from '../seller-api-provider';
import { AsyncBoundary, EmptyNotice, ErrorNotice } from './async';
import { useAsync } from './async';
import {
  COMPLIANCE_STATE_LABELS,
  formatDate,
  SellerStateBadge,
  VERIFICATION_TYPE_LABELS,
} from './status-display';
import { AgreementRow } from './status-display';

function toKind(error: unknown): SellerApiErrorKind {
  return error instanceof SellerApiError ? error.kind : 'SERVER';
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function ProfilePanel(): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.getProfile(), [client]);
  const state = useAsync(load, [load]);
  return (
    <AsyncBoundary state={state}>
      {(profile: OwnProfile) => (
        <div className="panel">
          <h2>Seller profile</h2>
          <p>
            Status: <SellerStateBadge state={profile.state} />
          </p>
          <p className="muted">
            Compliance: {COMPLIANCE_STATE_LABELS[profile.complianceState]}
          </p>
          <div className="muted detail-list">
            <p>Legal name: {profile.organization.legalName}</p>
            <p>Trade name: {profile.organization.tradeName}</p>
            <p>Business address: {profile.organization.businessAddress}</p>
            <p>Version: {profile.version}</p>
          </div>
        </div>
      )}
    </AsyncBoundary>
  );
}

// ---------------------------------------------------------------------------
// Business information (read GET /seller/business; update PATCH /seller/business)
// ---------------------------------------------------------------------------

export function BusinessPanel(): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.getBusiness(), [client]);
  const state = useAsync(load, [load]);
  const [editing, setEditing] = useState(false);
  return (
    <AsyncBoundary state={state}>
      {(business: BusinessInfo) => (
        <div className="panel">
          <h2>Business information</h2>
          <div className="muted detail-list">
            <p>Legal name: {business.legalName}</p>
            <p>Trade name: {business.tradeName}</p>
            <p>Business address: {business.businessAddress}</p>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() => { setEditing((current) => !current); }}
            >
              {editing ? 'Close editor' : 'Edit'}
            </button>
          </div>
          {editing && (
            <BusinessForm
              business={business}
              onSaved={() => { setEditing(false); }}
            />
          )}
        </div>
      )}
    </AsyncBoundary>
  );
}

function BusinessForm({
  business,
  onSaved,
}: {
  readonly business: BusinessInfo;
  readonly onSaved: () => void;
}): ReactNode {
  const client = useSellerApi();
  const loadProfile = useCallback(() => client.getProfile(), [client]);
  const profileState = useAsync(loadProfile, [loadProfile]);
  const [legalName, setLegalName] = useState(business.legalName);
  const [tradeName, setTradeName] = useState(business.tradeName);
  const [businessAddress, setBusinessAddress] = useState(business.businessAddress);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSave(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (profileState.status !== 'ready') return;
    void saveBusiness(
      client,
      profileState.data.sellerProfileId,
      profileState.data.version,
      { legalName, tradeName, businessAddress },
      setSaving,
      setNotice,
      onSaved,
    );
  }

  if (profileState.status === 'loading') return <p className="notice">Loading…</p>;
  if (profileState.status === 'error') return <ErrorNotice kind={profileState.kind} />;

  return (
    <form className="form" onSubmit={onSave}>
      <label>
        Legal name
        <input
          value={legalName}
          onChange={(event) => { setLegalName(event.target.value); }}
          required
          minLength={1}
          maxLength={256}
        />
      </label>
      <label>
        Trade name
        <input
          value={tradeName}
          onChange={(event) => { setTradeName(event.target.value); }}
          required
          minLength={1}
          maxLength={256}
        />
      </label>
      <label>
        Business address
        <input
          value={businessAddress}
          onChange={(event) => { setBusinessAddress(event.target.value); }}
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

async function saveBusiness(
  client: SellerApiClient,
  sellerProfileId: string,
  expectedVersion: number,
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
    await client.updateBusiness({
      sellerProfileId,
      expectedVersion,
      legalName: values.legalName,
      tradeName: values.tradeName,
      businessAddress: values.businessAddress,
    });
    setNotice(<div className="notice" role="status">Business information saved.</div>);
    onSaved();
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

// ---------------------------------------------------------------------------
// Verification status (evidence privacy: no references, no digests)
// ---------------------------------------------------------------------------

export function VerificationPanel(): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.getVerificationStatus(), [client]);
  const state = useAsync(load, [load]);
  return (
    <AsyncBoundary state={state}>
      {(status: VerificationStatus) => (
        <div className="panel">
          <h2>Verification status</h2>
          <p className="muted">
            Compliance: {COMPLIANCE_STATE_LABELS[status.complianceState]}
          </p>
          {status.verifications.length === 0 ? (
            <EmptyNotice>No verification records yet.</EmptyNotice>
          ) : (
            <ul className="plain-list">
              {status.verifications.map((item) => (
                <li key={`${item.verificationType}-${String(item.generation)}`}>
                  {VERIFICATION_TYPE_LABELS[item.verificationType]}: {item.state}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AsyncBoundary>
  );
}

// ---------------------------------------------------------------------------
// Warehouses (list/create/close — version comes from the own profile, never
// invented by the client)
// ---------------------------------------------------------------------------

export function WarehousesPanel(): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.listWarehouses(), [client]);
  const state = useAsync(load, [load]);
  return (
    <AsyncBoundary state={state}>
      {(warehouses: readonly WarehouseSummary[]) => (
        <WarehouseList warehouses={warehouses} />
      )}
    </AsyncBoundary>
  );
}

function WarehouseList({
  warehouses,
}: {
  readonly warehouses: readonly WarehouseSummary[];
}): ReactNode {
  const [creating, setCreating] = useState(false);
  return (
    <div className="panel">
      <h2>Warehouses</h2>
      {warehouses.length === 0 ? (
        <EmptyNotice>No warehouses yet.</EmptyNotice>
      ) : (
        <ul className="plain-list">
          {warehouses.map((warehouse) => (
            <li key={warehouse.warehouseId}>
              {warehouse.name} — {warehouse.state}
              <span className="muted"> ({formatDate(warehouse.updatedAt)})</span>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => { setCreating((current) => !current); }}
        >
          {creating ? 'Close' : 'Add warehouse'}
        </button>
      </div>
      {creating && <WarehouseCreateForm />}
    </div>
  );
}

function WarehouseCreateForm(): ReactNode {
  const client = useSellerApi();
  const loadProfile = useCallback(() => client.getProfile(), [client]);
  const profileState = useAsync(loadProfile, [loadProfile]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (profileState.status !== 'ready') return;
    void createWarehouse(
      client,
      profileState.data.version,
      { name, address },
      setSaving,
      setNotice,
    );
  }

  if (profileState.status === 'loading') return <p className="notice">Loading…</p>;
  if (profileState.status === 'error') return <ErrorNotice kind={profileState.kind} />;

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        Name
        <input
          value={name}
          onChange={(event) => { setName(event.target.value); }}
          required
          minLength={1}
          maxLength={256}
        />
      </label>
      <label>
        Address
        <input
          value={address}
          onChange={(event) => { setAddress(event.target.value); }}
          required
          minLength={1}
          maxLength={512}
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Create warehouse
        </button>
      </div>
      {notice}
    </form>
  );
}

async function createWarehouse(
  client: SellerApiClient,
  expectedVersion: number,
  values: { readonly name: string; readonly address: string },
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.createWarehouse({ expectedVersion, ...values });
    setNotice(<div className="notice" role="status">Warehouse created.</div>);
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}

// ---------------------------------------------------------------------------
// Agreements (D-05 record display only — never rates/terms)
// ---------------------------------------------------------------------------

export function AgreementsPanel(): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.listAgreements(), [client]);
  const state = useAsync(load, [load]);
  return (
    <AsyncBoundary state={state}>
      {(agreements: readonly {
        readonly agreementId: string;
        readonly agreementType: string;
        readonly reference: string;
        readonly state: string;
        readonly effectiveFrom: string;
        readonly effectiveTo?: string;
        readonly signedAt?: string;
      }[]) => (
        <div className="panel">
          <h2>Agreements</h2>
          <p className="muted">
            Approved agreement records only — no rates, fees, or terms are shown.
          </p>
          {agreements.length === 0 ? (
            <EmptyNotice>No agreements yet.</EmptyNotice>
          ) : (
            <ul className="plain-list">
              {agreements.map((agreement) => (
                <AgreementRow key={agreement.agreementId} agreement={agreement} />
              ))}
            </ul>
          )}
        </div>
      )}
    </AsyncBoundary>
  );
}

// ---------------------------------------------------------------------------
// Members (list/add — version comes from the own profile, never invented)
// ---------------------------------------------------------------------------

export function MembersPanel(): ReactNode {
  const client = useSellerApi();
  const load = useCallback(() => client.listMembers(), [client]);
  const state = useAsync(load, [load]);
  return (
    <AsyncBoundary state={state}>
      {(members: readonly {
        readonly identityId: string;
        readonly associationRole: 'OWNER' | 'MEMBER';
        readonly isPrimary: boolean;
        readonly state: 'ACTIVE' | 'REMOVED';
        readonly addedAt: string;
      }[]) => (
        <div className="panel">
          <h2>Members</h2>
          {members.length === 0 ? (
            <EmptyNotice>No members yet.</EmptyNotice>
          ) : (
            <ul className="plain-list">
              {members
                .filter((member) => member.state === 'ACTIVE')
                .map((member) => (
                  <li key={member.identityId}>
                    {member.associationRole === 'OWNER' ? 'Owner' : 'Member'} —{' '}
                    {member.identityId}
                  </li>
                ))}
            </ul>
          )}
          <MemberAddForm />
        </div>
      )}
    </AsyncBoundary>
  );
}

function MemberAddForm(): ReactNode {
  const client = useSellerApi();
  const loadProfile = useCallback(() => client.getProfile(), [client]);
  const profileState = useAsync(loadProfile, [loadProfile]);
  const [memberIdentityId, setMemberIdentityId] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (profileState.status !== 'ready') return;
    void addMember(
      client,
      profileState.data.version,
      memberIdentityId,
      setSaving,
      setNotice,
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        Member identity ID
        <input
          value={memberIdentityId}
          onChange={(event) => { setMemberIdentityId(event.target.value); }}
          required
          pattern="^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
          title="A valid UUIDv7 identity identifier"
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Add member
        </button>
      </div>
      {notice}
    </form>
  );
}

async function addMember(
  client: SellerApiClient,
  expectedVersion: number,
  memberIdentityId: string,
  setSaving: (value: boolean) => void,
  setNotice: (value: ReactNode) => void,
): Promise<void> {
  setSaving(true);
  try {
    await client.addMember({ expectedVersion, memberIdentityId });
    setNotice(<div className="notice" role="status">Member added.</div>);
  } catch (error) {
    setNotice(<ErrorNotice kind={toKind(error)} />);
  } finally {
    setSaving(false);
  }
}
