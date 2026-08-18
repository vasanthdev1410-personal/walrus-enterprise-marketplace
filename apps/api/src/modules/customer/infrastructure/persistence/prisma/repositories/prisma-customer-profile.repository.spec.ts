import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { OptimisticConcurrencyError } from '../../../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';

import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { CustomerAddress } from '../../../../domain/entities/customer-address';
import { CustomerAuditRecord } from '../../../../domain/entities/customer-audit-record';
import { CustomerBusinessProfile } from '../../../../domain/entities/customer-business-profile';
import { CustomerPreference } from '../../../../domain/entities/customer-preference';
import { CustomerProfile } from '../../../../domain/entities/customer-profile';
import { CustomerStateTransition } from '../../../../domain/entities/customer-state-transition';
import type { CustomerAggregateChangeSet } from '../../../../domain/ports/customer-repository.port';
import { PrismaCustomerProfileRepository } from './prisma-customer-profile.repository';

const PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000301');
const IDENTITY_ID = new UuidV7('01913110-789a-7123-8123-000000000302');
const ACTOR_ID = new UuidV7('01913110-789a-7123-8123-000000000303');
const TRANSITION_ID = new UuidV7('01913110-789a-7123-8123-000000000304');
const ADDRESS_ID = new UuidV7('01913110-789a-7123-8123-000000000305');
const ADDRESS_2_ID = new UuidV7('01913110-789a-7123-8123-000000000306');
const BUSINESS_ID = new UuidV7('01913110-789a-7123-8123-000000000307');
const PREFERENCE_ID = new UuidV7('01913110-789a-7123-8123-000000000308');
const AUDIT_ID = new UuidV7('01913110-789a-7123-8123-000000000309');
const NOW = new Date('2026-08-17T00:00:00.000Z');

function profile(
  state: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' = 'ACTIVE',
  version = 1,
): CustomerProfile {
  return new CustomerProfile({
    customerProfileId: PROFILE_ID,
    identityId: IDENTITY_ID,
    state,
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function transition(): CustomerStateTransition {
  return new CustomerStateTransition({
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
}

function address(
  overrides: Partial<ConstructorParameters<typeof CustomerAddress>[0]> = {},
): CustomerAddress {
  return new CustomerAddress({
    addressId: ADDRESS_ID,
    customerProfileId: PROFILE_ID,
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
    ...overrides,
  });
}

function businessProfile(): CustomerBusinessProfile {
  return new CustomerBusinessProfile({
    customerBusinessProfileId: BUSINESS_ID,
    customerProfileId: PROFILE_ID,
    companyName: 'Analytical Engines Ltd',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function preference(): CustomerPreference {
  return new CustomerPreference({
    preferenceId: PREFERENCE_ID,
    customerProfileId: PROFILE_ID,
    preferenceKey: 'language',
    preferenceValue: 'en',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function auditRecord(): CustomerAuditRecord {
  return new CustomerAuditRecord({
    auditEventId: AUDIT_ID,
    customerProfileId: PROFILE_ID,
    eventType: 'CUSTOMER_SUSPENDED',
    actorIdentityId: ACTOR_ID,
    occurredAt: NOW,
    createdAt: NOW,
  });
}

function changeSet(
  overrides: Partial<CustomerAggregateChangeSet> = {},
): CustomerAggregateChangeSet {
  return {
    customerProfile: profile('SUSPENDED', 2),
    addressesToAppend: [],
    addressesToUpdate: [],
    preferencesToAppend: [],
    preferencesToUpdate: [],
    transitionsToAppend: [transition()],
    auditRecordsToAppend: [auditRecord()],
    ...overrides,
  };
}

/** Minimal transaction mock that runs the callback against the model mocks. */
function prismaWith(models: Record<string, unknown>): PrismaService {
  const transaction = { ...models };
  return {
    $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) => callback(transaction)),
    ...models,
  } as unknown as PrismaService;
}

describe('PrismaCustomerProfileRepository (M06-M2 persistence, D-11/D-04/D-05/D-08)', () => {
  describe('reads', () => {
    it('finds a profile by id (round trip)', async () => {
      const findUnique = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
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
      const prisma = { customerProfile: { findUnique } } as unknown as PrismaService;
      const result = await new PrismaCustomerProfileRepository(prisma).findById(PROFILE_ID);
      expect(findUnique).toHaveBeenCalledWith({ where: { customerProfileId: PROFILE_ID.value } });
      expect(result?.properties.state).toBe('ACTIVE');
      expect(result?.properties.identityId.value).toBe(IDENTITY_ID.value);
    });

    it('finds a profile by identityId (one profile per identity)', async () => {
      const findUnique = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
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
      const prisma = { customerProfile: { findUnique } } as unknown as PrismaService;
      const result = await new PrismaCustomerProfileRepository(prisma).findByIdentityId(
        IDENTITY_ID,
      );
      expect(findUnique).toHaveBeenCalledWith({ where: { identityId: IDENTITY_ID.value } });
      expect(result?.properties.customerProfileId.value).toBe(PROFILE_ID.value);
    });

    it('returns null when no profile exists', async () => {
      const prisma = {
        customerProfile: {
          findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null),
        },
      } as unknown as PrismaService;
      expect(await new PrismaCustomerProfileRepository(prisma).findById(PROFILE_ID)).toBeNull();
    });

    it('reads addresses, business profile, preferences, transitions and audit records', async () => {
      const addressRow = {
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
      };
      const prisma = {
        customerAddress: {
          findMany: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue([addressRow]),
        },
        customerBusinessProfile: {
          findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
            customerBusinessProfileId: BUSINESS_ID.value,
            customerProfileId: PROFILE_ID.value,
            companyName: 'Analytical Engines Ltd',
            registrationLookupDigest: null,
            businessType: null,
            aggregateVersion: 1,
            createdAt: NOW,
            updatedAt: NOW,
          }),
        },
        customerPreference: {
          findMany: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue([
            {
              preferenceId: PREFERENCE_ID.value,
              customerProfileId: PROFILE_ID.value,
              preferenceKey: 'language',
              preferenceValue: 'en',
              aggregateVersion: 1,
              createdAt: NOW,
              updatedAt: NOW,
            },
          ]),
        },
        customerStateTransition: {
          findMany: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue([
            {
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
            },
          ]),
        },
        customerAuditRecord: {
          findMany: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue([
            {
              auditEventId: AUDIT_ID.value,
              customerProfileId: PROFILE_ID.value,
              eventType: 'CUSTOMER_SUSPENDED',
              actorIdentityId: ACTOR_ID.value,
              correlationId: null,
              evidenceDigest: null,
              occurredAt: NOW,
              createdAt: NOW,
            },
          ]),
        },
      } as unknown as PrismaService;
      const repository = new PrismaCustomerProfileRepository(prisma);
      expect((await repository.findAddresses(PROFILE_ID))[0]?.properties.isDefaultShipping).toBe(
        true,
      );
      expect((await repository.findBusinessProfile(PROFILE_ID))?.properties.companyName).toBe(
        'Analytical Engines Ltd',
      );
      expect((await repository.findPreferences(PROFILE_ID))[0]?.properties.preferenceKey).toBe(
        'language',
      );
      expect((await repository.findTransitions(PROFILE_ID))[0]?.properties.toState).toBe(
        'SUSPENDED',
      );
      expect((await repository.findAuditRecords(PROFILE_ID))[0]?.properties.eventType).toBe(
        'CUSTOMER_SUSPENDED',
      );
    });
  });

  describe('insert (new customer aggregate)', () => {
    it('creates the profile and appends children atomically in one transaction', async () => {
      const create = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const transitionCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const auditCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const prisma = prismaWith({
        customerProfile: { create },
        customerStateTransition: { create: transitionCreate },
        customerAuditRecord: { create: auditCreate },
      });
      await new PrismaCustomerProfileRepository(prisma).insert(changeSet());
      expect(create).toHaveBeenCalled();
      expect(transitionCreate).toHaveBeenCalled();
      expect(auditCreate).toHaveBeenCalled();
    });

    it('rejects two default shipping addresses in one change set (D-04 fail closed)', async () => {
      const create = jest.fn().mockResolvedValue({});
      const transaction = jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
        callback({ customerProfile: { create } }),
      );
      const prisma = {
        $transaction: transaction,
        customerProfile: { create },
      } as unknown as PrismaService;
      const bad = changeSet({
        customerProfile: profile(),
        addressesToAppend: [
          address({ isDefaultShipping: true }),
          address({
            addressId: ADDRESS_2_ID,
            isDefaultShipping: true,
          }),
        ],
        transitionsToAppend: [],
        auditRecordsToAppend: [],
      });
      await expect(new PrismaCustomerProfileRepository(prisma).insert(bad)).rejects.toThrow(
        'CUSTOMER_DEFAULT_ADDRESS_CONFLICT',
      );
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('save (version-guarded mutation, D-11)', () => {
    it('applies a version-matched change set and appends children', async () => {
      const updateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 1 });
      const addressUpsert = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const businessUpsert = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const preferenceUpsert = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const transitionCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const auditCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const prisma = prismaWith({
        customerProfile: { updateMany },
        customerAddress: { upsert: addressUpsert },
        customerBusinessProfile: { upsert: businessUpsert },
        customerPreference: { upsert: preferenceUpsert },
        customerStateTransition: { create: transitionCreate },
        customerAuditRecord: { create: auditCreate },
      });
      await new PrismaCustomerProfileRepository(prisma).save(
        changeSet({
          addressesToAppend: [address()],
          businessProfile: businessProfile(),
          preferencesToAppend: [preference()],
        }),
        new AggregateVersion(1),
      );
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            customerProfileId: PROFILE_ID.value,
            aggregateVersion: 1,
          },
        }),
      );
      expect(addressUpsert).toHaveBeenCalled();
      expect(businessUpsert).toHaveBeenCalled();
      expect(preferenceUpsert).toHaveBeenCalled();
      expect(transitionCreate).toHaveBeenCalled();
      expect(auditCreate).toHaveBeenCalled();
    });

    it('rolls back the whole transaction on a stale version (no partial mutation, no orphan audit)', async () => {
      const updateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 0 });
      const transitionCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const auditCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const prisma = prismaWith({
        customerProfile: { updateMany },
        customerStateTransition: { create: transitionCreate },
        customerAuditRecord: { create: auditCreate },
      });
      await expect(
        new PrismaCustomerProfileRepository(prisma).save(changeSet(), new AggregateVersion(1)),
      ).rejects.toThrow(OptimisticConcurrencyError);
      // The version guard failed first: no child or audit record was written.
      expect(transitionCreate).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('propagates a write failure so the transaction rolls back atomically', async () => {
      const updateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 1 });
      const auditCreate = jest.fn<Promise<unknown>, [unknown]>().mockRejectedValue(new Error('db'));
      const prisma = prismaWith({
        customerProfile: { updateMany },
        customerStateTransition: { create: jest.fn().mockResolvedValue({}) },
        customerAuditRecord: { create: auditCreate },
      });
      await expect(
        new PrismaCustomerProfileRepository(prisma).save(changeSet(), new AggregateVersion(1)),
      ).rejects.toThrow('db');
    });
  });

  describe('append-only safety (D-02/D-08)', () => {
    it('never exposes update or delete operations for transition/audit records', () => {
      const repository = new PrismaCustomerProfileRepository({} as unknown as PrismaService);
      expect(repository).not.toHaveProperty('updateTransition');
      expect(repository).not.toHaveProperty('deleteTransition');
      expect(repository).not.toHaveProperty('updateAuditRecord');
      expect(repository).not.toHaveProperty('deleteAuditRecord');
    });

    it('supports multiple addresses per profile (round trip)', async () => {
      const findMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue([
        {
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
        },
        {
          addressId: ADDRESS_2_ID.value,
          customerProfileId: PROFILE_ID.value,
          recipientName: 'Ada Lovelace',
          line1: '1 Analytical Engine Row',
          line2: null,
          city: 'London',
          region: null,
          postalCode: 'SW1A 1AA',
          countryCode: 'GB',
          phone: null,
          roles: ['BILLING'],
          isDefaultShipping: false,
          isDefaultBilling: true,
          state: 'ACTIVE',
          aggregateVersion: 1,
          createdAt: NOW,
          updatedAt: NOW,
          removedAt: null,
        },
      ]);
      const prisma = { customerAddress: { findMany } } as unknown as PrismaService;
      const addresses = await new PrismaCustomerProfileRepository(prisma).findAddresses(PROFILE_ID);
      expect(addresses).toHaveLength(2);
      expect(addresses.filter((address) => address.properties.isDefaultShipping)).toHaveLength(1);
      expect(addresses.filter((address) => address.properties.isDefaultBilling)).toHaveLength(1);
    });

    it('persists address removal with removedAt', async () => {
      const updateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 1 });
      const addressUpdate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const prisma = prismaWith({
        customerProfile: { updateMany },
        customerAddress: { update: addressUpdate },
        customerStateTransition: { create: jest.fn().mockResolvedValue({}) },
        customerAuditRecord: { create: jest.fn().mockResolvedValue({}) },
      });
      const removed = address({
        state: 'REMOVED',
        removedAt: NOW,
        isDefaultShipping: false,
      });
      await new PrismaCustomerProfileRepository(prisma).save(
        changeSet({ addressesToUpdate: [removed], addressesToAppend: [] }),
        new AggregateVersion(1),
      );
      expect(addressUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { addressId: ADDRESS_ID.value },
        }),
      );
    });
  });

  describe('business profile 0..1 cardinality (D-05)', () => {
    it('persists an optional business profile', async () => {
      const updateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 1 });
      const businessUpsert = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
      const prisma = prismaWith({
        customerProfile: { updateMany },
        customerBusinessProfile: { upsert: businessUpsert },
        customerStateTransition: { create: jest.fn().mockResolvedValue({}) },
        customerAuditRecord: { create: jest.fn().mockResolvedValue({}) },
      });
      await new PrismaCustomerProfileRepository(prisma).save(
        changeSet({ businessProfile: businessProfile() }),
        new AggregateVersion(1),
      );
      expect(businessUpsert).toHaveBeenCalled();
    });
  });

  describe('repository isolation and credentials (A-06/A-04)', () => {
    it('stores only logical references — no credential fields on any row', () => {
      const repository = new PrismaCustomerProfileRepository({} as unknown as PrismaService);
      for (const key of [
        'password',
        'passwordHash',
        'accessToken',
        'refreshToken',
        'session',
        'mfaSecret',
        'credentials',
      ]) {
        expect(repository).not.toHaveProperty(key);
      }
    });

    it('exposes no wildcard cross-customer repository shortcuts', () => {
      const repository = new PrismaCustomerProfileRepository({} as unknown as PrismaService);
      for (const method of ['findAll', 'findAllCustomers', 'findByAnyIdentity', 'deleteAll']) {
        expect(repository).not.toHaveProperty(method);
      }
    });
  });
});
