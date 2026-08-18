/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAddress } from '../../domain/entities/customer-address';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import { CustomerAddressPolicy } from '../../domain/policy/customer-address.policy';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import { CustomerApplicationError } from '../errors/customer-application.error';
import { CustomerAddressApplicationService } from './customer-address-application.service';

const PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000401');
const IDENTITY = new UuidV7('01913110-789a-7123-8123-000000000402');
const OTHER = new UuidV7('01913110-789a-7123-8123-000000000403');
const ADDRESS_ID = new UuidV7('01913110-789a-7123-8123-000000000404');
const ADDRESS_2_ID = new UuidV7('01913110-789a-7123-8123-000000000405');
const NOW = new Date('2026-08-17T00:00:00.000Z');

function uuid(seed: number): UuidV7 {
  return new UuidV7(`01913110-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function profile(version = 2): CustomerProfile {
  return new CustomerProfile({
    customerProfileId: PROFILE_ID,
    identityId: IDENTITY,
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
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

interface Harness {
  service: CustomerAddressApplicationService;
  repository: jest.Mocked<CustomerProfileRepository>;
}

function harness(): Harness {
  const repository = {
    findById: jest.fn(),
    findByIdentityId: jest.fn(),
    findAddresses: jest.fn(),
    findBusinessProfile: jest.fn(),
    findPreferences: jest.fn(),
    findTransitions: jest.fn(),
    findAuditRecords: jest.fn(),
    insert: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CustomerProfileRepository>;
  const idempotency = {
    execute: jest.fn(<T>(execution: { execute: () => Promise<T> }) => execution.execute()),
  } as unknown as ApiIdempotencyService;
  const rateLimiter = {
    consume: jest.fn().mockResolvedValue({ allowed: true }),
  };
  let uuidCounter = 100;
  const service = new CustomerAddressApplicationService(
    repository,
    new CustomerLifecycle(),
    new CustomerAddressPolicy(),
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
    idempotency,
    rateLimiter,
  );
  return { service, repository };
}

describe('CustomerAddressApplicationService (M06-M3, D-04)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('listAddresses / getAddress', () => {
    it("lists the caller's own addresses", async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findAddresses.mockResolvedValue([address()]);

      const result = await service.listAddresses(PROFILE_ID, IDENTITY);

      expect(result).toHaveLength(1);
      expect(result[0]?.addressId).toBe(ADDRESS_ID.value);
    });

    it('denies cross-customer address listing (non-enumerating)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());

      await expect(service.listAddresses(PROFILE_ID, OTHER)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
      );
    });

    it('returns a single address by id', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findAddresses.mockResolvedValue([address()]);

      const result = await service.getAddress(PROFILE_ID, ADDRESS_ID, IDENTITY);

      expect(result.addressId).toBe(ADDRESS_ID.value);
    });

    it('fails closed on an unknown or REMOVED address (non-enumerating)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findAddresses.mockResolvedValue([
        address({ state: 'REMOVED', removedAt: NOW, isDefaultShipping: false }),
      ]);

      await expect(service.getAddress(PROFILE_ID, ADDRESS_ID, IDENTITY)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
      );
    });
  });

  describe('addAddress', () => {
    const command = {
      customerProfileId: PROFILE_ID,
      actorIdentityId: IDENTITY,
      expectedVersion: 2,
      recipientName: 'Ada Lovelace',
      line1: '1 Analytical Engine Row',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      roles: ['SHIPPING' as const],
      idempotencyKey: 'key-1',
    };

    it('adds an ACTIVE address with audit and version bump', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());

      const result = await service.addAddress(command);

      expect(result.state).toBe('ACTIVE');
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.addressesToAppend[0]?.properties.roles).toContain('SHIPPING');
      expect(changeSet?.customerProfile.properties.aggregateVersion.value).toBe(3);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'CUSTOMER_ADDRESS_ADDED',
      );
    });

    it('rejects a stale expectedVersion without persisting', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(3));

      await expect(service.addAddress(command)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_STATE_CONFLICT'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateAddress', () => {
    const command = {
      customerProfileId: PROFILE_ID,
      addressId: ADDRESS_ID,
      actorIdentityId: IDENTITY,
      expectedVersion: 2,
      recipientName: 'Ada Lovelace',
      line1: '2 Revised Row',
      city: 'London',
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      idempotencyKey: 'key-1',
    };

    it('updates address fields with audit', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findAddresses.mockResolvedValue([address()]);

      const result = await service.updateAddress(command);

      expect(result.line1).toBe('2 Revised Row');
      expect(
        repository.save.mock.calls[0]?.[0]?.auditRecordsToAppend[0]?.properties.eventType,
      ).toBe('CUSTOMER_ADDRESS_UPDATED');
    });

    it('rejects mutation of a REMOVED address (fail closed)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findAddresses.mockResolvedValue([
        address({ state: 'REMOVED', removedAt: NOW, isDefaultShipping: false }),
      ]);

      await expect(service.updateAddress(command)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_ADDRESS_CONFLICT'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('removeAddress', () => {
    const command = {
      customerProfileId: PROFILE_ID,
      addressId: ADDRESS_ID,
      actorIdentityId: IDENTITY,
      expectedVersion: 2,
      idempotencyKey: 'key-1',
    };

    it('soft-removes an address with REMOVED state and removedAt', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findAddresses.mockResolvedValue([address({ isDefaultShipping: true })]);

      const result = await service.removeAddress(command);

      expect(result.removed).toBe(true);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.addressesToUpdate[0]?.properties.state).toBe('REMOVED');
      expect(changeSet?.addressesToUpdate[0]?.properties.removedAt).toEqual(NOW);
      // The removed default cannot remain a default (D-04).
      expect(changeSet?.addressesToUpdate[0]?.properties.isDefaultShipping).toBe(false);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'CUSTOMER_ADDRESS_REMOVED',
      );
    });

    it('rejects removing an already-removed address (fail closed)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findAddresses.mockResolvedValue([
        address({ state: 'REMOVED', removedAt: NOW, isDefaultShipping: false }),
      ]);

      await expect(service.removeAddress(command)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_ADDRESS_CONFLICT'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('setDefaultAddress', () => {
    const command = {
      customerProfileId: PROFILE_ID,
      addressId: ADDRESS_2_ID,
      actorIdentityId: IDENTITY,
      expectedVersion: 2,
      role: 'SHIPPING' as const,
      idempotencyKey: 'key-1',
    };

    it('sets a new default SHIPPING and clears the previous one atomically', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findAddresses.mockResolvedValue([
        address({ isDefaultShipping: true }),
        address({ addressId: ADDRESS_2_ID, isDefaultShipping: false }),
      ]);

      const result = await service.setDefaultAddress(command);

      expect(result.addressId).toBe(ADDRESS_2_ID.value);
      const changeSet = repository.save.mock.calls[0]?.[0];
      const updates = changeSet?.addressesToUpdate ?? [];
      const oldDefault = updates.find(
        (entry) => entry.properties.addressId.value === ADDRESS_ID.value,
      );
      const newDefault = updates.find(
        (entry) => entry.properties.addressId.value === ADDRESS_2_ID.value,
      );
      expect(oldDefault?.properties.isDefaultShipping).toBe(false);
      expect(newDefault?.properties.isDefaultShipping).toBe(true);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'CUSTOMER_DEFAULT_SHIPPING_SET',
      );
    });

    it('fails closed on an unknown target address', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findAddresses.mockResolvedValue([address()]);

      await expect(service.setDefaultAddress(command)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_ADDRESS_CONFLICT'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
