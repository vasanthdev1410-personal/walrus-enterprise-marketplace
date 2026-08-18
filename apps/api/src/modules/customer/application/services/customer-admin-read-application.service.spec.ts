/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CustomerAdminReadApplicationService } from './customer-admin-read-application.service';
import { CustomerApplicationError } from '../errors/customer-application.error';
import { CustomerProfile } from '../../domain/entities/customer-profile';
import { CustomerAuditRecord } from '../../domain/entities/customer-audit-record';
import { CustomerStateTransition } from '../../domain/entities/customer-state-transition';
import type { CustomerAdminAuthorizationPort } from '../ports/customer-admin-authorization.port';
import type { CustomerAdminReadRepository } from '../../domain/ports/customer-admin-read.port';

const adminIdentityId = new UuidV7('0191310f-789a-7123-8123-000000000001');
const customerProfileId = new UuidV7('0191310f-789a-7123-8123-000000000003');

function profile(customerProfileIdValue = customerProfileId): CustomerProfile {
  return new CustomerProfile({
    customerProfileId: customerProfileIdValue,
    identityId: new UuidV7('0191310f-789a-7123-8123-000000000006'),
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(2),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  });
}

function auditRecord(): CustomerAuditRecord {
  const occurredAt = new Date('2026-08-02T00:00:00.000Z');
  return new CustomerAuditRecord({
    auditEventId: new UuidV7('0191310f-789a-7123-8123-000000000004'),
    customerProfileId,
    eventType: 'CUSTOMER_PROFILE_UPDATED',
    actorIdentityId: adminIdentityId,
    occurredAt,
    createdAt: occurredAt,
  });
}

function transition(): CustomerStateTransition {
  const transitionedAt = new Date('2026-08-02T00:00:00.000Z');
  return new CustomerStateTransition({
    transitionId: new UuidV7('0191310f-789a-7123-8123-000000000005'),
    customerProfileId,
    fromState: 'ACTIVE',
    toState: 'SUSPENDED',
    stateVersion: 2,
    actorIdentityId: adminIdentityId,
    actorKind: 'ADMIN',
    transitionedAt,
    createdAt: transitionedAt,
    reasonReference: 'AZR-REF-001',
  });
}

describe('CustomerAdminReadApplicationService (M06-M5)', () => {
  const repository = {
    findAllProfiles: jest.fn(),
    findProfile: jest.fn(),
    findAuditRecords: jest.fn(),
    findTransitions: jest.fn(),
  } as unknown as jest.Mocked<CustomerAdminReadRepository>;
  const adminAuthorization = {
    isGranted: jest.fn(),
  } as unknown as jest.Mocked<CustomerAdminAuthorizationPort>;
  const rateLimiter = {
    consume: jest.fn(),
  };

  const service = new CustomerAdminReadApplicationService(
    repository,
    adminAuthorization,
    rateLimiter,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiter.consume.mockResolvedValue({
      allowed: true,
      limit: 50,
      remaining: 49,
      resetAt: new Date(Date.now() + 60_000),
    });
    adminAuthorization.isGranted.mockResolvedValue(true);
  });

  it('lists customers only after the admin grant (customer.read)', async () => {
    repository.findAllProfiles.mockResolvedValue([profile()]);
    const result = await service.listCustomers(adminIdentityId);
    expect(result).toHaveLength(1);
    expect(result[0]?.customerProfileId).toBe(customerProfileId.value);
    expect(adminAuthorization.isGranted).toHaveBeenCalledWith(adminIdentityId, 'customer.read');
    expect(repository.findAllProfiles).toHaveBeenCalledTimes(1);
  });

  it('denies the list without the grant (fail closed, no query runs)', async () => {
    adminAuthorization.isGranted.mockResolvedValue(false);
    await expect(service.listCustomers(adminIdentityId)).rejects.toBeInstanceOf(
      CustomerApplicationError,
    );
    expect(repository.findAllProfiles).not.toHaveBeenCalled();
  });

  it('denies on rate-limit exhaustion (D-10 admin 50/hour)', async () => {
    rateLimiter.consume.mockResolvedValue({
      allowed: false,
      limit: 50,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });
    await expect(service.listCustomers(adminIdentityId)).rejects.toEqual(
      new CustomerApplicationError('CUSTOMER_RATE_LIMITED'),
    );
    expect(repository.findAllProfiles).not.toHaveBeenCalled();
  });

  it('resolves detail with audit episodes and transitions', async () => {
    repository.findProfile.mockResolvedValue(profile());
    repository.findAuditRecords.mockResolvedValue([auditRecord()]);
    repository.findTransitions.mockResolvedValue([transition()]);
    const result = await service.getCustomerDetail(adminIdentityId, customerProfileId);
    expect(result.audit).toHaveLength(1);
    expect(result.transitions).toHaveLength(1);
    expect(result.state).toBe('ACTIVE');
  });

  it('resolves an unknown customer as CUSTOMER_NOT_FOUND (non-enumerating)', async () => {
    repository.findProfile.mockResolvedValue(null);
    await expect(service.getCustomerDetail(adminIdentityId, customerProfileId)).rejects.toEqual(
      new CustomerApplicationError('CUSTOMER_NOT_FOUND'),
    );
  });

  it('reads the audit trail only with customer.audit.view', async () => {
    repository.findProfile.mockResolvedValue(profile());
    repository.findAuditRecords.mockResolvedValue([auditRecord()]);
    const result = await service.getAuditTrail(adminIdentityId, customerProfileId);
    expect(result).toHaveLength(1);
    expect(adminAuthorization.isGranted).toHaveBeenCalledWith(
      adminIdentityId,
      'customer.audit.view',
    );
  });

  it('denies the audit trail without customer.audit.view', async () => {
    adminAuthorization.isGranted.mockResolvedValue(false);
    await expect(service.getAuditTrail(adminIdentityId, customerProfileId)).rejects.toBeInstanceOf(
      CustomerApplicationError,
    );
    expect(repository.findProfile).not.toHaveBeenCalled();
  });

  it('fails closed when the Module 02 adapter denies on engine error', async () => {
    // The Module02CustomerAdminAuthorizationAdapter maps any engine error to
    // `false` (fail closed at the port boundary) — the service must never
    // assume a grant and must not run the query.
    adminAuthorization.isGranted.mockResolvedValue(false);
    await expect(service.listCustomers(adminIdentityId)).rejects.toBeInstanceOf(
      CustomerApplicationError,
    );
    expect(repository.findAllProfiles).not.toHaveBeenCalled();
  });
});
