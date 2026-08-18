import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import {
  isCustomerPreferenceKey,
  type CustomerPreferenceKey,
} from '../value-objects/customer-preference-key';

/**
 * WEMP-M06-SPEC-001 §9 (decision D-06). A basic account preference: key/value
 * with per-key allow-listed validation. Unknown keys are rejected (deny by
 * default); values are format-checked per key. No notification-domain
 * preferences exist — notifications belong to Module 11 (A-13).
 */
export interface CustomerPreferenceProperties {
  readonly preferenceId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly preferenceKey: CustomerPreferenceKey;
  readonly preferenceValue: string;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function assertValidPreferenceValue(key: CustomerPreferenceKey, value: string): void {
  if (value.trim().length === 0) {
    throw new Error('Customer preference value is required');
  }
  switch (key) {
    case 'language':
      if (!/^[a-z]{2}$/.test(value)) {
        throw new Error('Customer language preference must be an ISO 639-1 code');
      }
      return;
    case 'currency':
      if (!/^[A-Z]{3}$/.test(value)) {
        throw new Error('Customer currency preference must be an ISO 4217 code');
      }
      return;
    case 'locale':
      if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(value)) {
        throw new Error('Customer locale preference must be a BCP 47 language tag');
      }
      return;
  }
}

export class CustomerPreference {
  public readonly properties: Readonly<CustomerPreferenceProperties>;

  public constructor(properties: CustomerPreferenceProperties) {
    if (!isCustomerPreferenceKey(properties.preferenceKey)) {
      throw new Error('Customer preference key is not allow-listed');
    }
    assertValidPreferenceValue(properties.preferenceKey, properties.preferenceValue);
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Customer preference updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
