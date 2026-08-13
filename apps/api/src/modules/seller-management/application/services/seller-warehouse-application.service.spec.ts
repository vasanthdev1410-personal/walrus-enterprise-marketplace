/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerIdentityAssociation } from '../../domain/entities/seller-identity-association';
import { SellerProfile } from '../../domain/entities/seller-profile';
import { SellerWarehouse } from '../../domain/entities/seller-warehouse';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import { SellerApplicationError } from '../errors/seller-application.error';
import { SellerWarehouseApplicationService } from './seller-warehouse-application.service';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const ORG = new UuidV7('0191310f-789a-7123-8123-000000000002');
const OWNER = new UuidV7('0191310f-789a-7123-8123-000000000003');
const MEMBER = new UuidV7('0191310f-789a-7123-8123-000000000004');
const NOW = new Date('2026-08-13T00:00:00.000Z');

function uuid(seed: number): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function profile(version: number): SellerProfile {
  return new SellerProfile({
    sellerProfileId: SELLER,
    organizationId: ORG,
    state: 'ACTIVE',
    complianceState: 'COMPLIANT',
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function association(identityId: UuidV7, role: 'OWNER' | 'MEMBER'): SellerIdentityAssociation {
  return new SellerIdentityAssociation({
    associationId: uuid(10),
    sellerProfileId: SELLER,
    identityId,
    associationRole: role,
    isPrimary: role === 'OWNER',
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function warehouse(state: 'ACTIVE' | 'CLOSED'): SellerWarehouse {
  return new SellerWarehouse({
    warehouseId: uuid(30),
    sellerProfileId: SELLER,
    name: 'Main Warehouse',
    address: 'Sector 62, Noida',
    state,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
    ...(state === 'CLOSED' ? { closedAt: NOW } : {}),
  });
}

interface Harness {
  service: SellerWarehouseApplicationService;
  repository: jest.Mocked<SellerProfileRepository>;
}

function harness(): Harness {
  const repository = {
    findById: jest.fn(),
    findOrganization: jest.fn(),
    findAssociations: jest.fn(),
    findVerifications: jest.fn(),
    findEvidence: jest.fn(),
    findTransitions: jest.fn(),
    findWarehouses: jest.fn(),
    findAgreements: jest.fn(),
    findActiveByRegistrationDigest: jest.fn(),
    findProfileByAssociatedIdentityId: jest.fn(),
    findAllSellers: jest.fn(),
    insert: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SellerProfileRepository>;
  const idempotency = {
    execute: jest.fn(<T>(execution: { execute: () => Promise<T> }) => execution.execute()),
  } as unknown as ApiIdempotencyService;
  const rateLimiter = {
    consume: jest.fn().mockResolvedValue({ allowed: true }),
  };
  let uuidCounter = 100;
  const service = new SellerWarehouseApplicationService(
    repository,
    new SellerAssociationPolicy(),
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
    idempotency,
    rateLimiter,
  );
  return { service, repository };
}

describe('SellerWarehouseApplicationService (M03-M5)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createWarehouse', () => {
    const command = {
      sellerProfileId: SELLER,
      actorIdentityId: OWNER,
      expectedVersion: 5,
      name: 'Main Warehouse',
      address: 'Sector 62, Noida',
    };

    it('creates an ACTIVE warehouse for the OWNER with audit and version bump', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);

      const result = await service.createWarehouse(command);

      expect(result).toMatchObject({ state: 'ACTIVE', sellerVersion: 6 });
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.warehousesToAppend[0]?.properties).toMatchObject({
        name: 'Main Warehouse',
        state: 'ACTIVE',
      });
      expect(changeSet?.sellerProfile.properties.aggregateVersion.value).toBe(6);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('SELLER_WAREHOUSE_CREATED');
    });

    it('denies a MEMBER (owner action only)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([
        association(OWNER, 'OWNER'),
        association(MEMBER, 'MEMBER'),
      ]);

      await expect(service.createWarehouse({ ...command, actorIdentityId: MEMBER })).rejects.toEqual(
        new SellerApplicationError('SELLER_OWNERSHIP_DENIED'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a stale version without persisting', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(6));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);

      await expect(
        service.createWarehouse({ ...command, expectedVersion: 5 }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_STATE_CONFLICT'));
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('fails closed when the seller does not exist', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(null);

      await expect(service.createWarehouse(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });
  });

  describe('closeWarehouse', () => {
    const command = {
      sellerProfileId: SELLER,
      warehouseId: uuid(30),
      actorIdentityId: OWNER,
      expectedVersion: 5,
    };

    it('closes an ACTIVE warehouse with audit', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);
      repository.findWarehouses.mockResolvedValue([warehouse('ACTIVE')]);

      const result = await service.closeWarehouse(command);

      expect(result).toMatchObject({ state: 'CLOSED', sellerVersion: 6 });
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.warehousesToAppend[0]?.properties).toMatchObject({
        state: 'CLOSED',
        closedAt: NOW,
      });
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('SELLER_WAREHOUSE_CLOSED');
    });

    it('rejects closing an unknown warehouse (non-enumerating)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);
      repository.findWarehouses.mockResolvedValue([]);

      await expect(service.closeWarehouse(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });

    it('rejects closing an already CLOSED warehouse', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);
      repository.findWarehouses.mockResolvedValue([warehouse('CLOSED')]);

      await expect(service.closeWarehouse(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
