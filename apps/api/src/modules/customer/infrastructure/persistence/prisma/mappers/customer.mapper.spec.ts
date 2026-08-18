import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAddress } from '../../../../domain/entities/customer-address';
import { CustomerAuditRecord } from '../../../../domain/entities/customer-audit-record';
import { CustomerBusinessProfile } from '../../../../domain/entities/customer-business-profile';
import { CustomerPreference } from '../../../../domain/entities/customer-preference';
import { CustomerProfile } from '../../../../domain/entities/customer-profile';
import { CustomerStateTransition } from '../../../../domain/entities/customer-state-transition';
import {
  assertKnownCustomerState,
  customerAddressMapper,
  customerAuditRecordMapper,
  customerBusinessProfileMapper,
  customerPreferenceMapper,
  customerProfileMapper,
  customerStateTransitionMapper,
} from './customer.mapper';

const PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000301');
const IDENTITY_ID = new UuidV7('01913110-789a-7123-8123-000000000302');
const ACTOR_ID = new UuidV7('01913110-789a-7123-8123-000000000303');
const TRANSITION_ID = new UuidV7('01913110-789a-7123-8123-000000000304');
const ADDRESS_ID = new UuidV7('01913110-789a-7123-8123-000000000305');
const BUSINESS_ID = new UuidV7('01913110-789a-7123-8123-000000000306');
const PREFERENCE_ID = new UuidV7('01913110-789a-7123-8123-000000000307');
const AUDIT_ID = new UuidV7('01913110-789a-7123-8123-000000000308');
const NOW = new Date('2026-08-17T00:00:00.000Z');

describe('M06 customer persistence mappers (WEMP-M06-SPEC-001 §13)', () => {
  describe('customerProfileMapper', () => {
    it('maps a persisted profile row back to the domain', () => {
      const profile = customerProfileMapper.toDomain({
        customerProfileId: PROFILE_ID.value,
        identityId: IDENTITY_ID.value,
        state: 'ACTIVE',
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        suspendedAt: null,
        closedAt: null,
        correlationId: null,
      });
      expect(profile.properties.customerProfileId).toEqual(PROFILE_ID);
      expect(profile.properties.identityId).toEqual(IDENTITY_ID);
      expect(profile.properties.state).toBe('ACTIVE');
      expect(profile.properties.aggregateVersion.value).toBe(1);
    });

    it('round-trips a profile to persistence with optional timestamps', () => {
      const entity = new CustomerProfile({
        customerProfileId: PROFILE_ID,
        identityId: IDENTITY_ID,
        state: 'SUSPENDED',
        aggregateVersion: new AggregateVersion(2),
        createdAt: NOW,
        updatedAt: NOW,
        suspendedAt: NOW,
      });
      const row = customerProfileMapper.toPersistence(entity);
      expect(row).toMatchObject({
        customerProfileId: PROFILE_ID.value,
        identityId: IDENTITY_ID.value,
        state: 'SUSPENDED',
        aggregateVersion: 2,
        suspendedAt: NOW,
      });
      expect(row.closedAt).toBeUndefined();
    });

    it('fails closed on an unknown persisted state', () => {
      expect(() => {
        assertKnownCustomerState('BOGUS' as never);
      }).toThrow('Unknown customer state in persistence record');
      expect(() => {
        assertKnownCustomerState('ACTIVE');
      }).not.toThrow();
    });
  });

  describe('customerStateTransitionMapper', () => {
    it('round-trips an append-only transition episode', () => {
      const entity = new CustomerStateTransition({
        transitionId: TRANSITION_ID,
        customerProfileId: PROFILE_ID,
        fromState: 'ACTIVE',
        toState: 'SUSPENDED',
        stateVersion: 2,
        actorIdentityId: ACTOR_ID,
        actorKind: 'ADMIN',
        transitionedAt: NOW,
        createdAt: NOW,
        reasonReference: 'spd:policy-violation',
      });
      const row = customerStateTransitionMapper.toPersistence(entity);
      expect(row).toMatchObject({ reasonReference: 'spd:policy-violation', stateVersion: 2 });
      const back = customerStateTransitionMapper.toDomain({
        transitionId: TRANSITION_ID.value,
        customerProfileId: PROFILE_ID.value,
        fromState: 'ACTIVE',
        toState: 'SUSPENDED',
        stateVersion: 2,
        actorIdentityId: ACTOR_ID.value,
        actorKind: 'ADMIN',
        reasonReference: 'spd:policy-violation',
        correlationId: null,
        causationId: null,
        sourceReference: null,
        transitionedAt: NOW,
        createdAt: NOW,
      });
      expect(back.properties.toState).toBe('SUSPENDED');
      expect(back.properties.reasonReference).toBe('spd:policy-violation');
      expect(back.properties.stateVersion).toBe(2);
    });
  });

  describe('customerAddressMapper', () => {
    it('round-trips an address with roles and defaults', () => {
      const entity = new CustomerAddress({
        addressId: ADDRESS_ID,
        customerProfileId: PROFILE_ID,
        recipientName: 'Ada Lovelace',
        line1: '1 Analytical Engine Row',
        city: 'London',
        postalCode: 'SW1A 1AA',
        countryCode: 'GB',
        roles: ['SHIPPING'],
        isDefaultShipping: true,
        isDefaultBilling: false,
        state: 'ACTIVE',
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });
      const row = customerAddressMapper.toPersistence(entity);
      expect(row).toMatchObject({ isDefaultShipping: true, roles: ['SHIPPING'] });
      const back = customerAddressMapper.toDomain({
        addressId: ADDRESS_ID.value,
        customerProfileId: PROFILE_ID.value,
        recipientName: 'Ada Lovelace',
        line1: '1 Analytical Engine Row',
        line2: null,
        city: 'London',
        region: null,
        postalCode: 'SW1A 1AA',
        countryCode: 'GB',
        phone: null,
        roles: ['SHIPPING'],
        isDefaultShipping: true,
        isDefaultBilling: false,
        state: 'ACTIVE',
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        removedAt: null,
      });
      expect(back.properties.isDefaultShipping).toBe(true);
      expect(back.properties.roles).toContain('SHIPPING');
      expect(back.properties.addressId).toEqual(ADDRESS_ID);
    });

    it('rejects a malformed persistence row (invalid country code fails closed)', () => {
      expect(() =>
        customerAddressMapper.toDomain({
          addressId: ADDRESS_ID.value,
          customerProfileId: PROFILE_ID.value,
          recipientName: 'Ada Lovelace',
          line1: '1 Analytical Engine Row',
          line2: null,
          city: 'London',
          region: null,
          postalCode: 'SW1A 1AA',
          countryCode: 'great-britain',
          phone: null,
          roles: ['SHIPPING'],
          isDefaultShipping: false,
          isDefaultBilling: false,
          state: 'ACTIVE',
          aggregateVersion: 1,
          createdAt: NOW,
          updatedAt: NOW,
          removedAt: null,
        }),
      ).toThrow('Customer address country code must be an ISO 3166-1 alpha-2 code');
    });
  });

  describe('customerBusinessProfileMapper', () => {
    it('round-trips an optional business profile with a lookup digest', () => {
      const entity = new CustomerBusinessProfile({
        customerBusinessProfileId: BUSINESS_ID,
        customerProfileId: PROFILE_ID,
        companyName: 'Analytical Engines Ltd',
        registrationLookupDigest: 'a'.repeat(64),
        businessType: 'PRIVATE_LIMITED',
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });
      const row = customerBusinessProfileMapper.toPersistence(entity);
      expect(row).toMatchObject({
        companyName: 'Analytical Engines Ltd',
        registrationLookupDigest: 'a'.repeat(64),
      });
      const back = customerBusinessProfileMapper.toDomain({
        customerBusinessProfileId: BUSINESS_ID.value,
        customerProfileId: PROFILE_ID.value,
        companyName: 'Analytical Engines Ltd',
        registrationLookupDigest: 'a'.repeat(64),
        businessType: 'PRIVATE_LIMITED',
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(back.properties.companyName).toBe('Analytical Engines Ltd');
      expect(back.properties.registrationLookupDigest).toBe('a'.repeat(64));
    });

    it('rejects a malformed row with a non-digest registration reference', () => {
      expect(() =>
        customerBusinessProfileMapper.toDomain({
          customerBusinessProfileId: BUSINESS_ID.value,
          customerProfileId: PROFILE_ID.value,
          companyName: 'Analytical Engines Ltd',
          registrationLookupDigest: 'GSTIN123456',
          businessType: null,
          aggregateVersion: 1,
          createdAt: NOW,
          updatedAt: NOW,
        }),
      ).toThrow(
        'Customer business profile registration lookup digest must be a SHA-256 hex digest',
      );
    });
  });

  describe('customerPreferenceMapper', () => {
    it('round-trips an allow-listed preference', () => {
      const entity = new CustomerPreference({
        preferenceId: PREFERENCE_ID,
        customerProfileId: PROFILE_ID,
        preferenceKey: 'language',
        preferenceValue: 'en',
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });
      const row = customerPreferenceMapper.toPersistence(entity);
      expect(row).toMatchObject({ preferenceKey: 'language', preferenceValue: 'en' });
      const back = customerPreferenceMapper.toDomain({
        preferenceId: PREFERENCE_ID.value,
        customerProfileId: PROFILE_ID.value,
        preferenceKey: 'language',
        preferenceValue: 'en',
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(back.properties.preferenceKey).toBe('language');
      expect(back.properties.preferenceValue).toBe('en');
    });

    it('rejects a malformed row with an unknown preference key', () => {
      expect(() =>
        customerPreferenceMapper.toDomain({
          preferenceId: PREFERENCE_ID.value,
          customerProfileId: PROFILE_ID.value,
          preferenceKey: 'notifications_enabled' as never,
          preferenceValue: 'true',
          aggregateVersion: 1,
          createdAt: NOW,
          updatedAt: NOW,
        }),
      ).toThrow('Customer preference key is not allow-listed');
    });
  });

  describe('customerAuditRecordMapper', () => {
    it('round-trips an append-only audit record', () => {
      const entity = new CustomerAuditRecord({
        auditEventId: AUDIT_ID,
        customerProfileId: PROFILE_ID,
        eventType: 'CUSTOMER_SUSPENDED',
        actorIdentityId: ACTOR_ID,
        occurredAt: NOW,
        createdAt: NOW,
        evidenceDigest: 'a'.repeat(64),
      });
      const row = customerAuditRecordMapper.toPersistence(entity);
      expect(row).toMatchObject({
        eventType: 'CUSTOMER_SUSPENDED',
        evidenceDigest: 'a'.repeat(64),
      });
      const back = customerAuditRecordMapper.toDomain({
        auditEventId: AUDIT_ID.value,
        customerProfileId: PROFILE_ID.value,
        eventType: 'CUSTOMER_SUSPENDED',
        actorIdentityId: ACTOR_ID.value,
        correlationId: null,
        evidenceDigest: 'a'.repeat(64),
        occurredAt: NOW,
        createdAt: NOW,
      });
      expect(back.properties.eventType).toBe('CUSTOMER_SUSPENDED');
      expect(back.properties.evidenceDigest).toBe('a'.repeat(64));
    });
  });
});
