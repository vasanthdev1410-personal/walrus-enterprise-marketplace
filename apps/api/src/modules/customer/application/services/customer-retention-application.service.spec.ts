/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CustomerAuditRecord } from '../../domain/entities/customer-audit-record';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import { CustomerStateTransition } from '../../domain/entities/customer-state-transition';
import { CustomerRetentionPolicy } from '../../domain/policy/customer-retention.policy';
import type { CustomerRetentionDeletionPort } from '../../domain/ports/customer-retention-deletion.port';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import { CustomerApplicationError } from '../errors/customer-application.error';
import type { CustomerAdminAuthorizationPort } from '../ports/customer-admin-authorization.port';
import type { CustomerRetentionConfigurationPort } from '../ports/customer-retention-configuration.port';
import { CustomerRetentionApplicationService } from './customer-retention-application.service';

const PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000401');
const ADMIN = new UuidV7('01913110-789a-7123-8123-000000000402');
const TRANSITION_ID = new UuidV7('01913110-789a-7123-8123-000000000403');
const AUDIT_ID = new UuidV7('01913110-789a-7123-8123-000000000404');
const NOW = new Date('2026-08-17T00:00:00.000Z');
const OLD = new Date('2019-08-10T00:00:00.000Z');

function uuid(seed: number): UuidV7 {
  return new UuidV7(`01913110-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function profile(): CustomerProfile {
  return new CustomerProfile({
    customerProfileId: PROFILE_ID,
    identityId: new UuidV7('01913110-789a-7123-8123-000000000405'),
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(3),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function expiredTransition(): CustomerStateTransition {
  return new CustomerStateTransition({
    transitionId: TRANSITION_ID,
    customerProfileId: PROFILE_ID,
    fromState: 'ACTIVE',
    toState: 'SUSPENDED',
    stateVersion: 2,
    actorIdentityId: ADMIN,
    actorKind: 'ADMIN',
    transitionedAt: OLD,
    createdAt: OLD,
    reasonReference: 'adm:historical',
  });
}

function expiredAudit(): CustomerAuditRecord {
  return new CustomerAuditRecord({
    auditEventId: AUDIT_ID,
    customerProfileId: PROFILE_ID,
    eventType: 'CUSTOMER_SUSPENDED',
    actorIdentityId: ADMIN,
    occurredAt: OLD,
    createdAt: OLD,
  });
}

interface Harness {
  service: CustomerRetentionApplicationService;
  repository: jest.Mocked<CustomerProfileRepository>;
  deletion: jest.Mocked<CustomerRetentionDeletionPort>;
  adminAuthorization: jest.Mocked<CustomerAdminAuthorizationPort>;
  retentionConfiguration: jest.Mocked<CustomerRetentionConfigurationPort>;
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
  const deletion = {
    deleteTransitions: jest.fn().mockResolvedValue(undefined),
    deleteAuditRecords: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CustomerRetentionDeletionPort>;
  const adminAuthorization = {
    isGranted: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<CustomerAdminAuthorizationPort>;
  const retentionConfiguration = {
    findRule: jest
      .fn<Promise<unknown>, [string]>()
      .mockImplementation((category: string) =>
        Promise.resolve(
          category === 'CustomerStateTransition' || category === 'CustomerAuditRecord'
            ? { category, retentionDays: 2555 }
            : undefined,
        ),
      ),
  } as unknown as jest.Mocked<CustomerRetentionConfigurationPort>;
  let uuidCounter = 100;
  const service = new CustomerRetentionApplicationService(
    repository,
    deletion,
    retentionConfiguration,
    new CustomerRetentionPolicy(),
    adminAuthorization,
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
  );
  return { service, repository, deletion, adminAuthorization, retentionConfiguration };
}

describe('CustomerRetentionApplicationService (M06-M3, D-15)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes expired transitions and audit records and audits the deletion', async () => {
    const { service, repository, deletion } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findTransitions.mockResolvedValue([expiredTransition()]);
    repository.findAuditRecords.mockResolvedValue([expiredAudit()]);

    const result = await service.processRetention({
      customerProfileId: PROFILE_ID,
      triggeredByIdentityId: ADMIN,
    });

    expect(result).toEqual({
      customerProfileId: PROFILE_ID.value,
      transitionsChecked: 1,
      transitionsExpired: 1,
      auditRecordsChecked: 1,
      auditRecordsExpired: 1,
    });
    expect(deletion.deleteTransitions).toHaveBeenCalledWith([
      expect.objectContaining({ value: TRANSITION_ID.value }),
    ]);
    expect(deletion.deleteAuditRecords).toHaveBeenCalledWith([
      expect.objectContaining({ value: AUDIT_ID.value }),
    ]);
    // The deletion itself is audited append-only.
    const changeSet = repository.save.mock.calls[0]?.[0];
    expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
      'CUSTOMER_RETENTION_EXPIRED_RECORDS_DELETED',
    );
  });

  it('deletes nothing when all records are within retention', async () => {
    const { service, repository, deletion } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findTransitions.mockResolvedValue([]);
    repository.findAuditRecords.mockResolvedValue([]);

    const result = await service.processRetention({
      customerProfileId: PROFILE_ID,
      triggeredByIdentityId: ADMIN,
    });

    expect(result.transitionsExpired).toBe(0);
    expect(result.auditRecordsExpired).toBe(0);
    expect(deletion.deleteTransitions).not.toHaveBeenCalled();
    expect(deletion.deleteAuditRecords).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('fails closed on missing retention configuration (nothing deleted)', async () => {
    const { service, repository, deletion, retentionConfiguration } = harness();
    repository.findById.mockResolvedValue(profile());
    repository.findTransitions.mockResolvedValue([expiredTransition()]);
    repository.findAuditRecords.mockResolvedValue([]);
    retentionConfiguration.findRule.mockResolvedValue(undefined);

    await expect(
      service.processRetention({ customerProfileId: PROFILE_ID, triggeredByIdentityId: ADMIN }),
    ).rejects.toEqual(new CustomerApplicationError('CUSTOMER_RETENTION_CONFIG_MISSING'));
    expect(deletion.deleteTransitions).not.toHaveBeenCalled();
    expect(deletion.deleteAuditRecords).not.toHaveBeenCalled();
  });

  it('denies a triggered admin without the customer.audit.view grant (fail closed)', async () => {
    const { service, adminAuthorization } = harness();
    adminAuthorization.isGranted.mockResolvedValue(false);

    await expect(
      service.processRetention({ customerProfileId: PROFILE_ID, triggeredByIdentityId: ADMIN }),
    ).rejects.toEqual(new CustomerApplicationError('CUSTOMER_ADMIN_AUTHORIZATION_DENIED'));
  });
});
