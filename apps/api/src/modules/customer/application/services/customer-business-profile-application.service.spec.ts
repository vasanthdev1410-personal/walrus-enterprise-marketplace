/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerBusinessProfile } from '../../domain/entities/customer-business-profile';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import { CustomerBusinessProfilePolicy } from '../../domain/policy/customer-business.policy';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import { CustomerApplicationError } from '../errors/customer-application.error';
import { CustomerBusinessProfileApplicationService } from './customer-business-profile-application.service';

const PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000401');
const IDENTITY = new UuidV7('01913110-789a-7123-8123-000000000402');
const OTHER = new UuidV7('01913110-789a-7123-8123-000000000403');
const BUSINESS_ID = new UuidV7('01913110-789a-7123-8123-000000000404');
const NOW = new Date('2026-08-17T00:00:00.000Z');
const DIGEST = 'a'.repeat(64);

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

function business(): CustomerBusinessProfile {
  return new CustomerBusinessProfile({
    customerBusinessProfileId: BUSINESS_ID,
    customerProfileId: PROFILE_ID,
    companyName: 'Analytical Engines Ltd',
    registrationLookupDigest: DIGEST,
    businessType: 'PRIVATE_LIMITED',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface Harness {
  service: CustomerBusinessProfileApplicationService;
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
  const service = new CustomerBusinessProfileApplicationService(
    repository,
    new CustomerLifecycle(),
    new CustomerBusinessProfilePolicy(),
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
    idempotency,
    rateLimiter,
  );
  return { service, repository };
}

describe('CustomerBusinessProfileApplicationService (M06-M3, D-05)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when the customer has no business profile (optional)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findBusinessProfile.mockResolvedValue(null);

    expect(await service.getBusinessProfile(PROFILE_ID, IDENTITY)).toBeNull();
  });

  it("returns the caller's own business profile", async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findBusinessProfile.mockResolvedValue(business());

    const result = await service.getBusinessProfile(PROFILE_ID, IDENTITY);

    expect(result?.companyName).toBe('Analytical Engines Ltd');
    expect(result?.registrationLookupDigest).toBe(DIGEST);
  });

  it('denies cross-customer business read (non-enumerating)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());

    await expect(service.getBusinessProfile(PROFILE_ID, OTHER)).rejects.toEqual(
      new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
    );
  });

  it('creates the optional business profile with audit', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findBusinessProfile.mockResolvedValue(null);

    const result = await service.createBusinessProfile({
      customerProfileId: PROFILE_ID,
      actorIdentityId: IDENTITY,
      expectedVersion: 2,
      companyName: 'Analytical Engines Ltd',
      registrationLookupDigest: DIGEST,
      businessType: 'PRIVATE_LIMITED',
      idempotencyKey: 'key-1',
    });

    expect(result.companyName).toBe('Analytical Engines Ltd');
    const changeSet = repository.save.mock.calls[0]?.[0];
    expect(changeSet?.businessProfile?.properties.companyName).toBe('Analytical Engines Ltd');
    expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
      'CUSTOMER_BUSINESS_PROFILE_CREATED',
    );
  });

  it('rejects a second business profile for the same customer (0..1 cardinality)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findBusinessProfile.mockResolvedValue(business());

    await expect(
      service.createBusinessProfile({
        customerProfileId: PROFILE_ID,
        actorIdentityId: IDENTITY,
        expectedVersion: 2,
        companyName: 'Another Ltd',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toEqual(new CustomerApplicationError('CUSTOMER_BUSINESS_PROFILE_CONFLICT'));
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('updates the business profile with audit', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findBusinessProfile.mockResolvedValue(business());

    const result = await service.updateBusinessProfile({
      customerProfileId: PROFILE_ID,
      actorIdentityId: IDENTITY,
      expectedVersion: 2,
      companyName: 'Analytical Engines Holdings Ltd',
      idempotencyKey: 'key-1',
    });

    expect(result.companyName).toBe('Analytical Engines Holdings Ltd');
    const changeSet = repository.save.mock.calls[0]?.[0];
    expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
      'CUSTOMER_BUSINESS_PROFILE_UPDATED',
    );
  });

  it('fails closed updating a business profile that does not exist', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findBusinessProfile.mockResolvedValue(null);

    await expect(
      service.updateBusinessProfile({
        customerProfileId: PROFILE_ID,
        actorIdentityId: IDENTITY,
        expectedVersion: 2,
        companyName: 'Ghost Ltd',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toEqual(new CustomerApplicationError('CUSTOMER_NOT_FOUND'));
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a stale expectedVersion without persisting', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile(3));

    await expect(
      service.createBusinessProfile({
        customerProfileId: PROFILE_ID,
        actorIdentityId: IDENTITY,
        expectedVersion: 2,
        companyName: 'Analytical Engines Ltd',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toEqual(new CustomerApplicationError('CUSTOMER_STATE_CONFLICT'));
    expect(repository.save).not.toHaveBeenCalled();
  });
});
