/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import { CustomerApplicationError } from '../errors/customer-application.error';
import { CustomerProfileApplicationService } from './customer-profile-application.service';

const PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000401');
const IDENTITY = new UuidV7('01913110-789a-7123-8123-000000000402');
const OTHER = new UuidV7('01913110-789a-7123-8123-000000000403');
const NOW = new Date('2026-08-17T00:00:00.000Z');

function uuid(seed: number): UuidV7 {
  return new UuidV7(`01913110-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function profile(
  version = 1,
  state: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' = 'ACTIVE',
): CustomerProfile {
  return new CustomerProfile({
    customerProfileId: PROFILE_ID,
    identityId: IDENTITY,
    state,
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
    ...(state === 'SUSPENDED' ? { suspendedAt: NOW } : {}),
    ...(state === 'CLOSED' ? { closedAt: NOW } : {}),
  });
}

interface Harness {
  service: CustomerProfileApplicationService;
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
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CustomerProfileRepository>;
  const idempotency = {
    execute: jest.fn(<T>(execution: { execute: () => Promise<T> }) => execution.execute()),
  } as unknown as ApiIdempotencyService;
  const rateLimiter = {
    consume: jest.fn().mockResolvedValue({ allowed: true }),
  };
  let uuidCounter = 100;
  const service = new CustomerProfileApplicationService(
    repository,
    new CustomerLifecycle(),
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
    idempotency,
    rateLimiter,
  );
  return { service, repository };
}

describe('CustomerProfileApplicationService (M06-M3, D-01/D-03/D-11)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createCustomerProfile', () => {
    it('creates an ACTIVE profile with a CUSTOMER_CREATED audit record', async () => {
      const { service, repository } = harness();
      repository.findByIdentityId.mockResolvedValue(null);

      const result = await service.createCustomerProfile({
        identityId: IDENTITY,
        idempotencyKey: 'key-1',
      });

      expect(result).toMatchObject({ state: 'ACTIVE', version: 1 });
      const changeSet = repository.insert.mock.calls[0]?.[0];
      expect(changeSet?.customerProfile.properties.identityId.value).toBe(IDENTITY.value);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('CUSTOMER_CREATED');
    });

    it('rejects a duplicate profile for the same identity (one profile per identity, D-01)', async () => {
      const { service, repository } = harness();
      repository.findByIdentityId.mockResolvedValue(profile());

      await expect(
        service.createCustomerProfile({ identityId: IDENTITY, idempotencyKey: 'key-1' }),
      ).rejects.toEqual(new CustomerApplicationError('CUSTOMER_DUPLICATE_DETECTED'));
      expect(repository.insert).not.toHaveBeenCalled();
    });
  });

  describe('getOwnProfile', () => {
    it("returns the caller's own profile resolved from the authenticated identity", async () => {
      const { service, repository } = harness();
      repository.findByIdentityId.mockResolvedValue(profile(3, 'ACTIVE'));

      const result = await service.getOwnProfile(IDENTITY);

      expect(result).toMatchObject({
        customerProfileId: PROFILE_ID.value,
        state: 'ACTIVE',
        version: 3,
      });
    });

    it('fails closed (non-enumerating) when the identity has no profile', async () => {
      const { service, repository } = harness();
      repository.findByIdentityId.mockResolvedValue(null);

      await expect(service.getOwnProfile(IDENTITY)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
      );
    });

    it('denies self-read of a CLOSED profile (D-02)', async () => {
      const { service, repository } = harness();
      repository.findByIdentityId.mockResolvedValue(profile(4, 'CLOSED'));

      await expect(service.getOwnProfile(IDENTITY)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_READ_FORBIDDEN'),
      );
    });
  });

  describe('getOwnProfileByReference', () => {
    it("resolves the caller's own profile through an internal reference", async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(2));

      const result = await service.getOwnProfileByReference(PROFILE_ID, IDENTITY);

      expect(result.customerProfileId).toBe(PROFILE_ID.value);
    });

    it('denies cross-customer access (non-enumerating)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile());

      await expect(service.getOwnProfileByReference(PROFILE_ID, OTHER)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
      );
    });

    it('fails closed on a malformed/unknown reference', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(null);

      await expect(service.getOwnProfileByReference(PROFILE_ID, IDENTITY)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
      );
    });
  });

  describe('updateProfile', () => {
    const command = {
      customerProfileId: PROFILE_ID,
      actorIdentityId: IDENTITY,
      expectedVersion: 3,
      idempotencyKey: 'key-1',
    };

    it('applies an allow-listed update and bumps the aggregate version with audit', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(3));

      const result = await service.updateProfile(command);

      expect(result.version).toBe(4);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.customerProfile.properties.aggregateVersion.value).toBe(4);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'CUSTOMER_PROFILE_UPDATED',
      );
    });

    it('rejects a stale expectedVersion without persisting (D-11)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(4));

      await expect(service.updateProfile({ ...command, expectedVersion: 3 })).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_STATE_CONFLICT'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies an update while SUSPENDED (self-service mutations ACTIVE-only, D-02)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(3, 'SUSPENDED'));

      await expect(service.updateProfile(command)).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_UPDATE_FORBIDDEN'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a cross-customer update (ownership fail closed)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(3));

      await expect(service.updateProfile({ ...command, actorIdentityId: OTHER })).rejects.toEqual(
        new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
