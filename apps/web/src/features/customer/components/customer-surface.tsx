'use client';

import { useCallback, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import type {
  CustomerAddressResult,
  CustomerApiErrorKind,
  CustomerBusinessProfileResult,
  CustomerPreferenceKey,
  CustomerPreferenceResult,
  CustomerProfileResult,
} from '@/src/lib/customer-api';
import { CustomerApiError } from '@/src/lib/customer-api';
import { useCustomerApi } from '../customer-api-provider';
import {
  AsyncBoundary,
  EmptyNotice,
  ErrorNotice,
  LoadingNotice,
} from '../../seller/components/async';
import { useAsync } from '../../seller/components/async';
import { formatDate } from '../../seller/components/status-display';

function toKind(error: unknown): CustomerApiErrorKind {
  return error instanceof CustomerApiError ? error.kind : 'SERVER';
}

/** Coerces a form field value to a string, failing safe on non-string values. */
function formValue(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Module 06 — Customer self-service (WEMP-M06-SPEC-001 §15, M06-M5). The
 * server remains authoritative for ownership and authorization (customer.*
 * self-service permissions through the Module 02 engine + the customer
 * ownership resolver); this UI renders server data and surfaces generic,
 * non-disclosing error states. Mutations carry an Idempotency-Key and the
 * current version (optimistic concurrency, D-11). No client-side
 * authorization decisions (A-08).
 */
export function CustomerSelfServicePanel(): ReactNode {
  const [section, setSection] = useState<'profile' | 'addresses' | 'business' | 'preferences'>(
    'profile',
  );

  return (
    <div>
      <nav className="portal-nav" aria-label="Customer self-service sections">
        {(
          [
            ['profile', 'Profile'],
            ['addresses', 'Addresses'],
            ['business', 'Business profile'],
            ['preferences', 'Preferences'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={id === section ? 'nav-active' : undefined}
            onClick={() => {
              setSection(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {section === 'profile' && <ProfileSection />}
      {section === 'addresses' && <AddressesSection />}
      {section === 'business' && <BusinessSection />}
      {section === 'preferences' && <PreferencesSection />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileSection(): ReactNode {
  const client = useCustomerApi();
  const load = useCallback(() => client.getProfile(), [client]);
  const state = useAsync(load, [load], toKind);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  if (state.status === 'loading') return <LoadingNotice />;
  if (state.status === 'error') return <ErrorNotice kind={state.kind} />;
  const profile = state.data;

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const expectedVersion = Number(formData.get('expectedVersion'));
    setSaving(true);
    void client
      .updateProfile({ expectedVersion })
      .then((updated: CustomerProfileResult) => {
        setNotice(
          <div className="notice" role="status">
            Profile updated — version {updated.version}.
          </div>,
        );
      })
      .catch((error: unknown) => {
        setNotice(<ErrorNotice kind={toKind(error)} />);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="panel">
      <h2>Profile</h2>
      <div className="muted detail-list">
        <p>Customer: {profile.customerProfileId}</p>
        <p>State: {profile.state}</p>
        <p>Version: {profile.version}</p>
        <p>Updated: {formatDate(profile.updatedAt)}</p>
      </div>
      <form className="form" onSubmit={onSubmit}>
        <input type="hidden" name="expectedVersion" value={profile.version} />
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save version bump'}
          </button>
        </div>
      </form>
      {notice}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

function AddressesSection(): ReactNode {
  const client = useCustomerApi();
  const load = useCallback(() => client.listAddresses(), [client]);
  const state = useAsync(load, [load], toKind);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);

  return (
    <div className="panel">
      <h2>Addresses</h2>
      <AsyncBoundary
        state={state}
        empty={(addresses) =>
          addresses.length === 0 ? <EmptyNotice>No addresses yet.</EmptyNotice> : null
        }
      >
        {(addresses: readonly CustomerAddressResult[]) => (
          <ul className="plain-list">
            {addresses.map((address) => (
              <li key={address.addressId}>
                {address.recipientName} — {address.line1}, {address.city} ({address.countryCode})
                <span className="muted">
                  {' '}
                  · {address.roles.join(', ')}
                  {address.isDefaultShipping ? ' · default shipping' : ''}
                  {address.isDefaultBilling ? ' · default billing' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setAdding((current) => !current);
          }}
        >
          {adding ? 'Close address form' : 'Add address'}
        </button>
      </div>
      {adding && <AddAddressForm onDone={setNotice} />}
      {notice}
    </div>
  );
}

function AddAddressForm({ onDone }: { readonly onDone: (notice: ReactNode) => void }): ReactNode {
  const client = useCustomerApi();
  const [saving, setSaving] = useState(false);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const roles = formData.getAll('roles') as string[];
    setSaving(true);
    void client
      .createAddress({
        recipientName: formValue(formData.get('recipientName')),
        line1: formValue(formData.get('line1')),
        city: formValue(formData.get('city')),
        postalCode: formValue(formData.get('postalCode')),
        countryCode: formValue(formData.get('countryCode')),
        roles: roles as CustomerAddressResult['roles'],
        expectedVersion: Number(formData.get('expectedVersion')),
      })
      .then(() => {
        onDone(
          <div className="notice" role="status">
            Address added.
          </div>,
        );
      })
      .catch((error: unknown) => {
        onDone(<ErrorNotice kind={toKind(error)} />);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        Recipient name
        <input type="text" name="recipientName" required maxLength={256} />
      </label>
      <label>
        Line 1
        <input type="text" name="line1" required maxLength={256} />
      </label>
      <label>
        City
        <input type="text" name="city" required maxLength={256} />
      </label>
      <label>
        Postal code
        <input type="text" name="postalCode" required maxLength={64} />
      </label>
      <label>
        Country code
        <input type="text" name="countryCode" required maxLength={2} placeholder="GB" />
      </label>
      <fieldset>
        <legend>Roles</legend>
        <label>
          <input type="checkbox" name="roles" value="SHIPPING" defaultChecked /> Shipping
        </label>
        <label>
          <input type="checkbox" name="roles" value="BILLING" /> Billing
        </label>
      </fieldset>
      <input type="hidden" name="expectedVersion" value="0" />
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add address'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Business profile
// ---------------------------------------------------------------------------

function BusinessSection(): ReactNode {
  const client = useCustomerApi();
  const load = useCallback(() => client.getBusinessProfile(), [client]);
  const state = useAsync(load, [load], toKind);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [saving, setSaving] = useState(false);

  if (state.status === 'loading') return <LoadingNotice />;
  if (state.status === 'error' && state.kind === 'NOT_FOUND') {
    return (
      <>
        <BusinessForm existing={null} saving={saving} setSaving={setSaving} onDone={setNotice} />
        {notice}
      </>
    );
  }
  if (state.status === 'error') return <ErrorNotice kind={state.kind} />;
  return (
    <>
      <BusinessForm
        existing={state.data}
        saving={saving}
        setSaving={setSaving}
        onDone={setNotice}
      />
      {notice}
    </>
  );
}

function BusinessForm({
  existing,
  saving,
  setSaving,
  onDone,
}: {
  readonly existing: CustomerBusinessProfileResult | null;
  readonly saving: boolean;
  readonly setSaving: (value: boolean) => void;
  readonly onDone: (notice: ReactNode) => void;
}): ReactNode {
  const client = useCustomerApi();

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const businessType = formValue(formData.get('businessType'));
    setSaving(true);
    void client
      .upsertBusinessProfile({
        companyName: formValue(formData.get('companyName')),
        ...(businessType === '' ? {} : { businessType }),
        expectedVersion: 0,
      })
      .then(() => {
        onDone(
          <div className="notice" role="status">
            Business profile saved.
          </div>,
        );
      })
      .catch((error: unknown) => {
        onDone(<ErrorNotice kind={toKind(error)} />);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="panel">
      <h2>Business profile</h2>
      {existing !== null && (
        <div className="muted detail-list">
          <p>Company: {existing.companyName}</p>
          {existing.businessType !== undefined && <p>Type: {existing.businessType}</p>}
        </div>
      )}
      <form className="form" onSubmit={onSubmit}>
        <label>
          Company name
          <input
            type="text"
            name="companyName"
            required
            maxLength={256}
            defaultValue={existing?.companyName ?? ''}
          />
        </label>
        <label>
          Business type (optional)
          <input
            type="text"
            name="businessType"
            maxLength={64}
            defaultValue={existing?.businessType ?? ''}
          />
        </label>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : existing === null ? 'Create business profile' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

const PREFERENCE_LABELS: Readonly<Record<CustomerPreferenceKey, string>> = {
  language: 'Language',
  currency: 'Currency',
  locale: 'Locale',
};

function PreferencesSection(): ReactNode {
  const client = useCustomerApi();
  const load = useCallback(() => client.listPreferences(), [client]);
  const state = useAsync(load, [load], toKind);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [saving, setSaving] = useState(false);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const preferenceKey = formValue(formData.get('preferenceKey')) as CustomerPreferenceKey;
    setSaving(true);
    void client
      .updatePreference({
        preferenceKey,
        preferenceValue: formValue(formData.get('preferenceValue')),
        expectedVersion: 0,
      })
      .then(() => {
        setNotice(
          <div className="notice" role="status">
            Preference updated.
          </div>,
        );
      })
      .catch((error: unknown) => {
        setNotice(<ErrorNotice kind={toKind(error)} />);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="panel">
      <h2>Preferences</h2>
      <AsyncBoundary
        state={state}
        empty={(preferences) =>
          preferences.length === 0 ? <EmptyNotice>No preferences set.</EmptyNotice> : null
        }
      >
        {(preferences: readonly CustomerPreferenceResult[]) => (
          <ul className="plain-list">
            {preferences.map((preference) => (
              <li key={preference.preferenceKey}>
                {PREFERENCE_LABELS[preference.preferenceKey]}: {preference.preferenceValue}
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Preference
          <select name="preferenceKey" defaultValue="language">
            <option value="language">Language</option>
            <option value="currency">Currency</option>
            <option value="locale">Locale</option>
          </select>
        </label>
        <label>
          Value
          <input type="text" name="preferenceValue" required maxLength={128} />
        </label>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Update preference'}
          </button>
        </div>
      </form>
      {notice}
    </div>
  );
}
