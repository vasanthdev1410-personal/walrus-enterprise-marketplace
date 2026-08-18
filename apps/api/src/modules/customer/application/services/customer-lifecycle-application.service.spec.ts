/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import { CustomerLifecycle } from '../../domain/lifecycle/customer-lifecycle';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import { CustomerApplicationError } from '../errors/customer-application.error';
import type { CustomerAdminAuthorizationPort } from '../ports/customer-admin-authorization.port';
import { CustomerLifecycleApplicationService } from './customer-lifecycle-application.service';

const PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000401');
const IDENTITY = new UuidV7('01913110-789a-7123-8123-000000000402');
const ADMIN = new UuidV7('01913110-789a-7123-8123-000000000403');
const NOW = new Date('2026-08-17T00:00:00.000Z');

function uuid(seed: number): UuidV7 {
  return new UuidV7(`01913110-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function profile(version: number, state: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'): CustomerProfile {
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

const baseCommand = {
  customerProfileId: PROFILE_ID,
  actorIdentityId: ADMIN,
  expectedVersion: 2,
  reasonReference: 'adm:review-2026-08-17',
  idempotencyKey: 'key-1',
};

interface Harness {
  service: CustomerLifecycleApplicationService;
  repository: jest.Mocked<CustomerProfileRepository>;
  adminAuthorization: jest.Mocked<CustomerAdminAuthorizationPort>;
}

function harness(granted = true): Harness {
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
  const adminAuthorization = {
    isGranted: jest.fn().mockResolvedValue(granted),
  } as unknown as jest.Mocked<CustomerAdminAuthorizationPort>;
  const idempotency = {
    execute: jest.fn(<T>(execution: { execute: () => Promise<T> }) => execution.execute()),
  } as unknown as ApiIdempotencyService;
  const rateLimiter = {
    consume: jest.fn().mockResolvedValue({ allowed: true }),
  };
  let uuidCounter = 100;
  const service = new CustomerLifecycleApplicationService(
    repository,
    new CustomerLifecycle(),
    adminAuthorization,
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
    idempotency,
    rateLimiter,
  );
  return { service, repository, adminAuthorization };
}

describe('CustomerLifecycleApplicationService (M06-M3, D-02)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('suspends an ACTIVE customer with a mandatory reason, transition episode and audit', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile(2, 'ACTIVE'));

    const result = await service.suspendCustomer(baseCommand);

    expect(result).toMatchObject({ state: 'SUSPENDED', version: 3 });
    const changeSet = repository.save.mock.calls[0]?.[0];
    expect(changeSet?.transitionsToAppend[0]?.properties).toMatchObject({
      fromState: 'ACTIVE',
      toState: 'SUSPENDED',
      reasonReference: 'adm:review-2026-08-17',
    });
    expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('CUSTOMER_SUSPENDED');
  });

  it('reactivates a SUSPENDED customer', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile(3, 'SUSPENDED'));

    const result = await service.reactivateCustomer({ ...baseCommand, expectedVersion: 3 });

    expect(result.state).toBe('ACTIVE');
    expect(repository.save.mock.calls[0]?.[0]?.transitionsToAppend[0]?.properties.toState).toBe(
      'ACTIVE',
    );
  });

  it('closes an ACTIVE customer (CLOSED terminal)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile(2, 'ACTIVE'));

    const result = await service.closeCustomer(baseCommand);

    expect(result.state).toBe('CLOSED');
    expect(repository.save.mock.calls[0]?.[0]?.auditRecordsToAppend[0]?.properties.eventType).toBe(
      'CUSTOMER_CLOSED',
    );
  });

  it('rejects a transition out of CLOSED (terminal, fail closed)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile(4, 'CLOSED'));

    await expect(service.reactivateCustomer(baseCommand)).rejects.toEqual(
      new CustomerApplicationError('CUSTOMER_STATE_CONFLICT'),
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid transition (SUSPENDED → SUSPENDED no-op denied)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile(3, 'SUSPENDED'));

    await expect(service.suspendCustomer(baseCommand)).rejects.toEqual(
      new CustomerApplicationError('CUSTOMER_STATE_CONFLICT'),
    );
  });

  it('denies a transition without an admin grant (fail closed)', async () => {
    const { service, repository } = harness(false);
    repository.findById.mockResolvedValue(profile(2, 'ACTIVE'));

    await expect(service.suspendCustomer(baseCommand)).rejects.toEqual(
      new CustomerApplicationError('CUSTOMER_ADMIN_AUTHORIZATION_DENIED'),
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('requires a mandatory reason reference (fail closed)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile(2, 'ACTIVE'));

    await expect(
      service.suspendCustomer({ ...baseCommand, reasonReference: '   ' }),
    ).rejects.toEqual(new CustomerApplicationError('CUSTOMER_REASON_REQUIRED'));
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a stale expectedVersion without persisting (D-11)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(profile(3, 'ACTIVE'));

    await expect(service.suspendCustomer(baseCommand)).rejects.toEqual(
      new CustomerApplicationError('CUSTOMER_STATE_CONFLICT'),
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('fails closed on an unknown customer profile (non-enumerating)', async () => {
    const { service, repository } = harness();
    repository.findById.mockResolvedValue(null);

    await expect(service.suspendCustomer(baseCommand)).rejects.toEqual(
      new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
    );
  });
});
