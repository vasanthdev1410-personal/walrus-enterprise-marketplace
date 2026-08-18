import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAddressSnapshot } from './customer-address-snapshot';
import { CustomerReference } from './customer-reference';
import { isCustomerPreferenceKey } from './customer-preference-key';
import { isTerminalCustomerState } from './customer-state';

const NOW = new Date('2026-08-17T00:00:00.000Z');

describe('Customer value objects (M06-M1)', () => {
  describe('CustomerReference (D-13)', () => {
    it('wraps a valid UUIDv7 customerProfileId', () => {
      const reference = new CustomerReference('0191310f-789a-7123-8123-000000000001');
      expect(reference.value).toBe('0191310f-789a-7123-8123-000000000001');
    });

    it('rejects invalid UUID references (fail closed)', () => {
      expect(() => new CustomerReference('not-a-uuid')).toThrow('Value must be a UUID version 7');
      expect(() => new CustomerReference('0191310f-789a-4123-8123-000000000001')).toThrow(
        'Value must be a UUID version 7',
      );
    });

    it('is a stable logical reference distinct from the identity', () => {
      const reference = new CustomerReference('0191310f-789a-7123-8123-000000000001');
      expect(reference).toBeInstanceOf(UuidV7);
      expect(reference.toString()).toBe(reference.value);
    });
  });

  describe('CustomerAddressSnapshot (D-13, immutable for M10)', () => {
    const base = {
      addressId: new UuidV7('0191310f-789a-7123-8123-000000000010'),
      recipientName: 'Ada Lovelace',
      line1: '1 Analytical Engine Row',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      capturedAt: NOW,
    };

    it('builds an immutable snapshot from an active address reference', () => {
      const snapshot = new CustomerAddressSnapshot(base);
      expect(snapshot.properties.recipientName).toBe('Ada Lovelace');
      expect(Object.isFrozen(snapshot.properties)).toBe(true);
    });

    it('rejects missing required fields and invalid country codes', () => {
      expect(() => new CustomerAddressSnapshot({ ...base, recipientName: '   ' })).toThrow(
        'Address snapshot recipient name is required',
      );
      expect(() => new CustomerAddressSnapshot({ ...base, countryCode: 'great-britain' })).toThrow(
        'Address snapshot country code must be an ISO 3166-1 alpha-2 code',
      );
    });
  });

  describe('CustomerState vocabulary (D-02)', () => {
    it('defines exactly ACTIVE, SUSPENDED, CLOSED with CLOSED terminal', () => {
      expect(isTerminalCustomerState('CLOSED')).toBe(true);
      expect(isTerminalCustomerState('ACTIVE')).toBe(false);
      expect(isTerminalCustomerState('SUSPENDED')).toBe(false);
    });
  });

  describe('CustomerPreferenceKey allow-list (D-06)', () => {
    it('accepts only the approved basic account preference keys', () => {
      expect(isCustomerPreferenceKey('language')).toBe(true);
      expect(isCustomerPreferenceKey('currency')).toBe(true);
      expect(isCustomerPreferenceKey('locale')).toBe(true);
      expect(isCustomerPreferenceKey('notifications')).toBe(false);
      expect(isCustomerPreferenceKey('email_digest')).toBe(false);
    });
  });
});
