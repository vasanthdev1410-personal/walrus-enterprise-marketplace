import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAddress } from '../entities/customer-address';
import { CustomerBusinessProfile } from '../entities/customer-business-profile';
import { CustomerAddressPolicy } from './customer-address.policy';
import { CustomerBusinessProfilePolicy } from './customer-business.policy';

const PROFILE = new UuidV7('0191310f-789a-7123-8123-000000000001');
const NOW = new Date('2026-08-17T00:00:00.000Z');

function uu(seed: string): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${seed.padStart(12, '0')}`);
}

interface AddressOverrides {
  readonly addressId: UuidV7;
  readonly roles?: readonly ('SHIPPING' | 'BILLING')[];
  readonly isDefaultShipping?: boolean;
  readonly isDefaultBilling?: boolean;
  readonly state?: 'ACTIVE' | 'REMOVED';
  readonly removedAt?: Date;
}

function address(overrides: AddressOverrides): CustomerAddress {
  return new CustomerAddress({
    addressId: overrides.addressId,
    customerProfileId: PROFILE,
    recipientName: 'Ada Lovelace',
    line1: '1 Analytical Engine Row',
    city: 'London',
    postalCode: 'SW1A 1AA',
    countryCode: 'GB',
    roles: overrides.roles ?? ['SHIPPING'],
    isDefaultShipping: overrides.isDefaultShipping ?? false,
    isDefaultBilling: overrides.isDefaultBilling ?? false,
    state: overrides.state ?? 'ACTIVE',
    ...(overrides.removedAt !== undefined ? { removedAt: overrides.removedAt } : {}),
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('CustomerAddressPolicy (M06-M1, WEMP-M06-SPEC-001 §7 D-04)', () => {
  const policy = new CustomerAddressPolicy();

  it('accepts a single default shipping and a single default billing address', () => {
    const set = [
      address({ addressId: uu('1'), isDefaultShipping: true }),
      address({ addressId: uu('2'), roles: ['BILLING'], isDefaultBilling: true }),
    ];
    expect(() => {
      policy.assertValidAddresses(set);
    }).not.toThrow();
    expect(policy.findDefault(set, 'SHIPPING')?.properties.addressId.value).toBe(uu('1').value);
    expect(policy.findDefault(set, 'BILLING')?.properties.addressId.value).toBe(uu('2').value);
  });

  it('rejects two default shipping addresses (at most one default per role)', () => {
    const set = [
      address({ addressId: uu('1'), isDefaultShipping: true }),
      address({ addressId: uu('2'), isDefaultShipping: true }),
    ];
    expect(() => {
      policy.assertValidAddresses(set);
    }).toThrow('CUSTOMER_DEFAULT_ADDRESS_CONFLICT');
  });

  it('rejects two default billing addresses (at most one default per role)', () => {
    const set = [
      address({ addressId: uu('1'), roles: ['BILLING'], isDefaultBilling: true }),
      address({ addressId: uu('2'), roles: ['BILLING'], isDefaultBilling: true }),
    ];
    expect(() => {
      policy.assertValidAddresses(set);
    }).toThrow('CUSTOMER_DEFAULT_ADDRESS_CONFLICT');
  });

  it('accepts a REMOVED address without defaults in the aggregate set', () => {
    const set = [
      address({ addressId: uu('1'), isDefaultShipping: true }),
      address({ addressId: uu('2'), state: 'REMOVED', removedAt: NOW }),
    ];
    expect(() => {
      policy.assertValidAddresses(set);
    }).not.toThrow();
    expect(policy.findDefault(set, 'SHIPPING')?.properties.addressId.value).toBe(uu('1').value);
    // The entity itself rejects a REMOVED default (see customer-domain-entities.spec.ts);
    // the policy re-checks the invariant at the aggregate boundary.
    expect(
      () =>
        new CustomerAddress({
          addressId: uu('3'),
          customerProfileId: PROFILE,
          recipientName: 'Grace Hopper',
          line1: '2 Compiler Court',
          city: 'New York',
          postalCode: '10001',
          countryCode: 'US',
          roles: ['BILLING'],
          isDefaultShipping: false,
          isDefaultBilling: true,
          state: 'REMOVED',
          removedAt: NOW,
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
    ).toThrow('Removed address cannot be a default address');
  });

  it('rejects duplicate active address ids', () => {
    const set = [address({ addressId: uu('1') }), address({ addressId: uu('1') })];
    expect(() => {
      policy.assertValidAddresses(set);
    }).toThrow('CUSTOMER_ADDRESS_CONFLICT');
  });

  it('returns null defaults when none are set', () => {
    const set = [address({ addressId: uu('1') })];
    expect(policy.findDefault(set, 'SHIPPING')).toBeNull();
    expect(policy.findDefault(set, 'BILLING')).toBeNull();
  });

  it('never resolves a REMOVED address as active', () => {
    const set = [address({ addressId: uu('1'), state: 'REMOVED', removedAt: NOW })];
    expect(policy.findActiveAddress(set, uu('1').value)).toBeNull();
  });

  describe('setDefault (atomic default replacement, D-04)', () => {
    it('sets a new default and clears the previous default for the same role atomically', () => {
      const set = [
        address({ addressId: uu('1'), isDefaultShipping: true }),
        address({ addressId: uu('2') }),
      ];
      const updated = policy.setDefault(set, uu('2').value, 'SHIPPING');
      const shipping = policy.findDefault(updated, 'SHIPPING');
      expect(shipping?.properties.addressId.value).toBe(uu('2').value);
      const cleared = updated.find((a) => a.properties.addressId.value === uu('1').value);
      expect(cleared?.properties.isDefaultShipping).toBe(false);
    });

    it('fails closed on an unknown, REMOVED, or role-mismatched target', () => {
      const set = [
        address({ addressId: uu('1'), isDefaultShipping: true }),
        address({ addressId: uu('2') }),
      ];
      expect(() => {
        policy.setDefault(set, 'unknown', 'SHIPPING');
      }).toThrow('CUSTOMER_ADDRESS_CONFLICT');
      expect(() => {
        policy.setDefault(set, uu('3').value, 'SHIPPING');
      }).toThrow('CUSTOMER_ADDRESS_CONFLICT');
      // uu('2') carries only the SHIPPING role — setting BILLING default fails.
      expect(() => {
        policy.setDefault(set, uu('2').value, 'BILLING');
      }).toThrow('CUSTOMER_ADDRESS_CONFLICT');
    });
  });
});

describe('CustomerBusinessProfilePolicy (M06-M1, WEMP-M06-SPEC-001 §8 D-05)', () => {
  const policy = new CustomerBusinessProfilePolicy();

  it('permits attaching a business profile when the customer has none (0..1)', () => {
    expect(() => {
      policy.assertCanAttachBusinessProfile(null);
    }).not.toThrow();
  });

  it('rejects a second business profile for the same customer (cardinality)', () => {
    const existing = new CustomerBusinessProfile({
      customerBusinessProfileId: uu('9'),
      customerProfileId: PROFILE,
      companyName: 'Analytical Engines Ltd',
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(() => {
      policy.assertCanAttachBusinessProfile(existing);
    }).toThrow('CUSTOMER_BUSINESS_PROFILE_CONFLICT');
  });
});
