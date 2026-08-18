/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerPreference } from '../../domain/entities/customer-preference';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import { CustomerApplicationError } from '../errors/customer-application.error';
import { CustomerPreferenceApplicationService } from './customer-preference-application.service';

const PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000401');
const IDENTITY = new UuidV7('01913110-789a-7123-8123-000000000402');
const OTHER = new UuidV7('01913110-789a-7123-8123-000000000403');
const PREFERENCE_ID = new UuidV7('01913110-789a-7123-8123-000000000404');
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

interface Harness {
  service: CustomerPreferenceApplicationService;
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
  const service = new CustomerPreferenceApplicationService(
    repository,
    new CustomerLifecycle(),
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
    idempotency,
    rateLimiter,
  );
  return { service, repository };
}

describe('CustomerPreferenceApplicationService (M06-M3, D-06)', () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the caller's own preferences", async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findPreferences.mockResolvedValue([preference()]);

    const result = await service.getPreferences(PROFILE_ID, IDENTITY);

    expect(result[0]?.preferenceKey).toBe('language');
    expect(result[0]?.preferenceValue).toBe('en');
  });

  it('denies cross-customer preference read (non-enumerating)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());

    await expect(service.getPreferences(PROFILE_ID, OTHER)).rejects.toEqual(
      new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
    );
  });

  it('creates a new allow-listed preference row (upsert append path)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findPreferences.mockResolvedValue([]);

    const result = await service.updatePreference({
      customerProfileId: PROFILE_ID,
      actorIdentityId: IDENTITY,
      expectedVersion: 2,
      preferenceKey: 'language',
      preferenceValue: 'en',
      idempotencyKey: 'key-1',
    });

    expect(result.preferenceValue).toBe('en');
    const changeSet = repository.save.mock.calls[0]?.[0];
    expect(changeSet?.preferencesToAppend[0]?.properties.preferenceKey).toBe('language');
    expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
      'CUSTOMER_PREFERENCE_UPDATED',
    );
  });

  it('updates an existing preference row (upsert update path)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findPreferences.mockResolvedValue([preference()]);

    const result = await service.updatePreference({
      customerProfileId: PROFILE_ID,
      actorIdentityId: IDENTITY,
      expectedVersion: 2,
      preferenceKey: 'language',
      preferenceValue: 'fr',
      idempotencyKey: 'key-1',
    });

    expect(result.preferenceValue).toBe('fr');
    const changeSet = repository.save.mock.calls[0]?.[0];
    expect(changeSet?.preferencesToUpdate[0]?.properties.preferenceValue).toBe('fr');
  });

  it('rejects an unknown preference key (allow-list, deny by default)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findPreferences.mockResolvedValue([]);

    await expect(
      service.updatePreference({
        customerProfileId: PROFILE_ID,
        actorIdentityId: IDENTITY,
        expectedVersion: 2,
        preferenceKey: 'notifications_enabled' as never,
        preferenceValue: 'true',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toThrow('Customer preference key is not allow-listed');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a stale expectedVersion without persisting', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile(3));

    await expect(
      service.updatePreference({
        customerProfileId: PROFILE_ID,
        actorIdentityId: IDENTITY,
        expectedVersion: 2,
        preferenceKey: 'language',
        preferenceValue: 'en',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toEqual(new CustomerApplicationError('CUSTOMER_STATE_CONFLICT'));
    expect(repository.save).not.toHaveBeenCalled();
  });
});
