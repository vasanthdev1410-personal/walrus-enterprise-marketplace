import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAddress } from './customer-address';
import { CustomerAuditRecord } from './customer-audit-record';
import { CustomerBusinessProfile } from './customer-business-profile';
import { CustomerPreference } from './customer-preference';
import { CustomerProfile } from './customer-profile';
import { CustomerStateTransition } from './customer-state-transition';

const PROFILE = new UuidV7('0191310f-789a-7123-8123-000000000001');
const IDENTITY = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ACTOR = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NOW = new Date('2026-08-17T00:00:00.000Z');

function uu(seed: string): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${seed.padStart(12, '0')}`);
}

function profile(
  state: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' = 'ACTIVE',
  version = 1,
): CustomerProfile {
  return new CustomerProfile({
    customerProfileId: PROFILE,
    identityId: IDENTITY,
    state,
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('Customer domain entity invariants (M06-M1, WEMP-M06-SPEC-001)', () => {
  describe('CustomerProfile (D-01)', () => {
    it('accepts a valid ACTIVE profile linked to an identity', () => {
      const created = profile();
      expect(created.properties.state).toBe('ACTIVE');
      expect(created.properties.identityId.value).toBe(IDENTITY.value);
    });

    it('rejects timestamps before creation', () => {
      expect(
        () =>
          new CustomerProfile({
            ...profile().properties,
            closedAt: new Date('2026-08-16T00:00:00.000Z'),
          }),
      ).toThrow('Customer profile closedAt cannot precede createdAt');
    });

    it('rejects a non-positive aggregate version', () => {
      expect(
        () =>
          new CustomerProfile({
            ...profile().properties,
            aggregateVersion: new AggregateVersion(0),
          }),
      ).toThrow('Aggregate version must be a positive safe integer');
    });

    it('exposes an immutable identityId as the only identity linkage', () => {
      const created = profile();
      expect(Object.isFrozen(created.properties)).toBe(true);
      expect(Object.keys(created.properties)).toEqual(
        expect.arrayContaining(['customerProfileId', 'identityId', 'state', 'aggregateVersion']),
      );
      // No authentication/credential material may exist on the profile (A-04).
      expect(created.properties).not.toHaveProperty('password');
      expect(created.properties).not.toHaveProperty('credentials');
      expect(created.properties).not.toHaveProperty('session');
      expect(created.properties).not.toHaveProperty('mfa');
      expect(created.properties).not.toHaveProperty('secret');
    });
  });

  describe('CustomerStateTransition (D-02)', () => {
    const base = {
      customerProfileId: PROFILE,
      actorIdentityId: ACTOR,
      actorKind: 'ADMIN',
      transitionedAt: NOW,
      createdAt: NOW,
    };

    it('accepts a valid transition episode with fromState, toState and reason', () => {
      const episode = new CustomerStateTransition({
        ...base,
        transitionId: uu('1'),
        fromState: 'ACTIVE',
        toState: 'SUSPENDED',
        stateVersion: 2,
        reasonReference: 'spd:policy-violation',
      });
      expect(episode.properties.toState).toBe('SUSPENDED');
      expect(episode.properties.stateVersion).toBe(2);
    });

    it('rejects same-state transitions and non-positive versions', () => {
      expect(
        () =>
          new CustomerStateTransition({
            ...base,
            transitionId: uu('1'),
            fromState: 'ACTIVE',
            toState: 'ACTIVE',
            stateVersion: 2,
            reasonReference: 'spd:reason',
          }),
      ).toThrow('Customer state transition must change state');
      expect(
        () =>
          new CustomerStateTransition({
            ...base,
            transitionId: uu('1'),
            fromState: 'ACTIVE',
            toState: 'SUSPENDED',
            stateVersion: 0,
            reasonReference: 'spd:reason',
          }),
      ).toThrow('Customer state version must be a positive safe integer');
    });

    it('requires a mandatory non-disclosing reason reference (fail closed)', () => {
      expect(
        () =>
          new CustomerStateTransition({
            ...base,
            transitionId: uu('1'),
            fromState: 'ACTIVE',
            toState: 'CLOSED',
            stateVersion: 2,
            reasonReference: '   ',
          }),
      ).toThrow('Customer transition requires a non-disclosing reason reference');
    });

    it('rejects timestamps before the transition', () => {
      expect(
        () =>
          new CustomerStateTransition({
            ...base,
            transitionId: uu('1'),
            fromState: 'ACTIVE',
            toState: 'SUSPENDED',
            stateVersion: 2,
            reasonReference: 'spd:reason',
            createdAt: new Date('2026-08-16T00:00:00.000Z'),
          }),
      ).toThrow('Customer transition createdAt cannot precede transitionedAt');
    });
  });

  describe('CustomerAddress (D-04)', () => {
    const base = {
      customerProfileId: PROFILE,
      recipientName: 'Ada Lovelace',
      line1: '1 Analytical Engine Row',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts a SHIPPING address', () => {
      const address = new CustomerAddress({
        ...base,
        addressId: uu('10'),
        roles: ['SHIPPING'],
        isDefaultShipping: false,
        isDefaultBilling: false,
        state: 'ACTIVE',
      });
      expect(address.properties.roles).toContain('SHIPPING');
    });

    it('accepts a BILLING address', () => {
      const address = new CustomerAddress({
        ...base,
        addressId: uu('11'),
        roles: ['BILLING'],
        isDefaultShipping: false,
        isDefaultBilling: false,
        state: 'ACTIVE',
      });
      expect(address.properties.roles).toContain('BILLING');
    });

    it('requires at least one role', () => {
      expect(
        () =>
          new CustomerAddress({
            ...base,
            addressId: uu('10'),
            roles: [],
            isDefaultShipping: false,
            isDefaultBilling: false,
            state: 'ACTIVE',
          }),
      ).toThrow('Customer address requires at least one role');
    });

    it('requires the matching role tag for a default flag', () => {
      expect(
        () =>
          new CustomerAddress({
            ...base,
            addressId: uu('10'),
            roles: ['SHIPPING'],
            isDefaultShipping: false,
            isDefaultBilling: true,
            state: 'ACTIVE',
          }),
      ).toThrow('Default billing address requires the BILLING role');
    });

    it('rejects a REMOVED address without removedAt', () => {
      expect(
        () =>
          new CustomerAddress({
            ...base,
            addressId: uu('10'),
            roles: ['SHIPPING'],
            isDefaultShipping: false,
            isDefaultBilling: false,
            state: 'REMOVED',
          }),
      ).toThrow('Removed address requires removedAt');
    });

    it('forbids a REMOVED address from being a default (soft removal invariant)', () => {
      expect(
        () =>
          new CustomerAddress({
            ...base,
            addressId: uu('10'),
            roles: ['SHIPPING'],
            isDefaultShipping: true,
            isDefaultBilling: false,
            state: 'REMOVED',
            removedAt: NOW,
          }),
      ).toThrow('Removed address cannot be a default address');
    });

    it('rejects removedAt without the REMOVED state and invalid country codes', () => {
      expect(
        () =>
          new CustomerAddress({
            ...base,
            addressId: uu('10'),
            roles: ['SHIPPING'],
            isDefaultShipping: false,
            isDefaultBilling: false,
            state: 'ACTIVE',
            removedAt: NOW,
          }),
      ).toThrow('removedAt requires the REMOVED address state');
      expect(
        () =>
          new CustomerAddress({
            ...base,
            addressId: uu('10'),
            roles: ['SHIPPING'],
            isDefaultShipping: false,
            isDefaultBilling: false,
            state: 'ACTIVE',
            countryCode: 'great-britain',
          }),
      ).toThrow('Customer address country code must be an ISO 3166-1 alpha-2 code');
    });
  });

  describe('CustomerBusinessProfile (D-05)', () => {
    it('is optional — a valid profile needs no business record', () => {
      expect(() => profile()).not.toThrow();
    });

    it('accepts a valid business profile with a lookup digest', () => {
      const business = new CustomerBusinessProfile({
        customerBusinessProfileId: uu('20'),
        customerProfileId: PROFILE,
        companyName: 'Analytical Engines Ltd',
        registrationLookupDigest: 'a'.repeat(64),
        businessType: 'PRIVATE_LIMITED',
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(business.properties.companyName).toBe('Analytical Engines Ltd');
    });

    it('rejects a non-SHA-256 registration lookup digest (never raw values)', () => {
      expect(
        () =>
          new CustomerBusinessProfile({
            customerBusinessProfileId: uu('20'),
            customerProfileId: PROFILE,
            companyName: 'Analytical Engines Ltd',
            registrationLookupDigest: 'GSTIN123456',
            aggregateVersion: new AggregateVersion(1),
            createdAt: NOW,
            updatedAt: NOW,
          }),
      ).toThrow(
        'Customer business profile registration lookup digest must be a SHA-256 hex digest',
      );
    });
  });

  describe('CustomerPreference (D-06)', () => {
    const base = {
      customerProfileId: PROFILE,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts allow-listed language/currency/locale preferences', () => {
      expect(
        new CustomerPreference({
          ...base,
          preferenceId: uu('30'),
          preferenceKey: 'language',
          preferenceValue: 'en',
        }).properties.preferenceValue,
      ).toBe('en');
      expect(
        new CustomerPreference({
          ...base,
          preferenceId: uu('31'),
          preferenceKey: 'currency',
          preferenceValue: 'USD',
        }).properties.preferenceValue,
      ).toBe('USD');
      expect(
        new CustomerPreference({
          ...base,
          preferenceId: uu('32'),
          preferenceKey: 'locale',
          preferenceValue: 'en-GB',
        }).properties.preferenceValue,
      ).toBe('en-GB');
    });

    it('rejects unknown preference keys (deny by default)', () => {
      expect(
        () =>
          new CustomerPreference({
            ...base,
            preferenceId: uu('30'),
            preferenceKey: 'notifications_enabled' as never,
            preferenceValue: 'true',
          }),
      ).toThrow('Customer preference key is not allow-listed');
    });

    it('rejects malformed values per key', () => {
      expect(
        () =>
          new CustomerPreference({
            ...base,
            preferenceId: uu('30'),
            preferenceKey: 'language',
            preferenceValue: 'english',
          }),
      ).toThrow('Customer language preference must be an ISO 639-1 code');
      expect(
        () =>
          new CustomerPreference({
            ...base,
            preferenceId: uu('31'),
            preferenceKey: 'currency',
            preferenceValue: 'dollar',
          }),
      ).toThrow('Customer currency preference must be an ISO 4217 code');
    });
  });

  describe('CustomerAuditRecord (D-08)', () => {
    it('accepts a valid append-only audit event with an evidence digest', () => {
      const record = new CustomerAuditRecord({
        auditEventId: uu('40'),
        customerProfileId: PROFILE,
        eventType: 'CUSTOMER_SUSPENDED',
        actorIdentityId: ACTOR,
        occurredAt: NOW,
        createdAt: NOW,
        evidenceDigest: 'a'.repeat(64),
      });
      expect(record.properties.eventType).toBe('CUSTOMER_SUSPENDED');
    });

    it('rejects a non-SHA-256 evidence digest', () => {
      expect(
        () =>
          new CustomerAuditRecord({
            auditEventId: uu('40'),
            customerProfileId: PROFILE,
            eventType: 'CUSTOMER_SUSPENDED',
            actorIdentityId: ACTOR,
            occurredAt: NOW,
            createdAt: NOW,
            evidenceDigest: 'not-a-digest',
          }),
      ).toThrow('Customer audit evidence digest must be a SHA-256 hex digest');
    });

    it('rejects timestamps before the event occurred', () => {
      expect(
        () =>
          new CustomerAuditRecord({
            auditEventId: uu('40'),
            customerProfileId: PROFILE,
            eventType: 'CUSTOMER_SUSPENDED',
            actorIdentityId: ACTOR,
            occurredAt: NOW,
            createdAt: new Date('2026-08-16T00:00:00.000Z'),
          }),
      ).toThrow('Customer audit createdAt cannot precede occurredAt');
    });
  });

  describe('No authentication credentials in any customer domain object (A-04)', () => {
    it('asserts the full domain vocabulary carries no credential material', () => {
      const entities: readonly object[] = [
        profile(),
        new CustomerStateTransition({
          transitionId: uu('1'),
          customerProfileId: PROFILE,
          fromState: 'ACTIVE',
          toState: 'SUSPENDED',
          stateVersion: 2,
          actorIdentityId: ACTOR,
          actorKind: 'ADMIN',
          transitionedAt: NOW,
          createdAt: NOW,
          reasonReference: 'spd:reason',
        }),
        new CustomerAddress({
          addressId: uu('10'),
          customerProfileId: PROFILE,
          recipientName: 'Ada Lovelace',
          line1: '1 Analytical Engine Row',
          city: 'London',
          postalCode: 'SW1A 1AA',
          countryCode: 'GB',
          roles: ['SHIPPING'],
          isDefaultShipping: false,
          isDefaultBilling: false,
          state: 'ACTIVE',
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
        new CustomerBusinessProfile({
          customerBusinessProfileId: uu('20'),
          customerProfileId: PROFILE,
          companyName: 'Analytical Engines Ltd',
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
        new CustomerPreference({
          preferenceId: uu('30'),
          customerProfileId: PROFILE,
          preferenceKey: 'language',
          preferenceValue: 'en',
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
        new CustomerAuditRecord({
          auditEventId: uu('40'),
          customerProfileId: PROFILE,
          eventType: 'CUSTOMER_CREATED',
          actorIdentityId: ACTOR,
          occurredAt: NOW,
          createdAt: NOW,
        }),
      ];
      for (const entity of entities) {
        for (const forbidden of ['password', 'credentials', 'session', 'mfa', 'secret']) {
          expect(entity).not.toHaveProperty(forbidden);
        }
      }
    });
  });
});
