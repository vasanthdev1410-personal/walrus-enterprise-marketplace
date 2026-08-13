/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerIdentityAssociation } from '../../domain/entities/seller-identity-association';
import { SellerProfile } from '../../domain/entities/seller-profile';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import { SellerApplicationError } from '../errors/seller-application.error';
import { SellerMemberApplicationService } from './seller-member-application.service';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const ORG = new UuidV7('0191310f-789a-7123-8123-000000000002');
const OWNER = new UuidV7('0191310f-789a-7123-8123-000000000003');
const MEMBER = new UuidV7('0191310f-789a-7123-8123-000000000004');
const INTRUDER = new UuidV7('0191310f-789a-7123-8123-000000000005');
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

function association(
  identityId: UuidV7,
  role: 'OWNER' | 'MEMBER',
  state: 'ACTIVE' | 'REMOVED' = 'ACTIVE',
): SellerIdentityAssociation {
  return new SellerIdentityAssociation({
    associationId: uuid(10),
    sellerProfileId: SELLER,
    identityId,
    associationRole: role,
    isPrimary: role === 'OWNER',
    state,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
    ...(state === 'REMOVED' ? { removedAt: NOW } : {}),
  });
}

interface Harness {
  service: SellerMemberApplicationService;
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
  const service = new SellerMemberApplicationService(
    repository,
    new SellerAssociationPolicy(),
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
    idempotency,
    rateLimiter,
  );
  return { service, repository };
}

describe('SellerMemberApplicationService (M03-M5, D-01)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('addMember', () => {
    const command = {
      sellerProfileId: SELLER,
      actorIdentityId: OWNER,
      expectedVersion: 5,
      memberIdentityId: MEMBER,
    };

    it('adds an ACTIVE MEMBER association for the OWNER with audit', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);

      const result = await service.addMember(command);

      expect(result).toMatchObject({
        memberIdentityId: MEMBER.value,
        associationRole: 'MEMBER',
        associationState: 'ACTIVE',
        sellerVersion: 6,
      });
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.associationsToAppend[0]?.properties).toMatchObject({
        identityId: MEMBER,
        associationRole: 'MEMBER',
        state: 'ACTIVE',
      });
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('SELLER_MEMBER_ADDED');
    });

    it('denies a MEMBER adding members (owner action only)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);

      await expect(service.addMember({ ...command, actorIdentityId: INTRUDER })).rejects.toEqual(
        new SellerApplicationError('SELLER_OWNERSHIP_DENIED'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a duplicate member (already associated)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([
        association(OWNER, 'OWNER'),
        association(MEMBER, 'MEMBER'),
      ]);

      await expect(service.addMember(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_DUPLICATE_DETECTED'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a stale version', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(6));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);

      await expect(service.addMember({ ...command, expectedVersion: 5 })).rejects.toEqual(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );
    });
  });

  describe('removeMember', () => {
    const command = {
      sellerProfileId: SELLER,
      actorIdentityId: OWNER,
      expectedVersion: 5,
      memberIdentityId: MEMBER,
    };

    it('removes a MEMBER association (REMOVED + removedAt) with audit', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([
        association(OWNER, 'OWNER'),
        association(MEMBER, 'MEMBER'),
      ]);

      const result = await service.removeMember(command);

      expect(result).toMatchObject({ associationState: 'REMOVED', sellerVersion: 6 });
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.associationsToAppend[0]?.properties).toMatchObject({
        identityId: MEMBER,
        state: 'REMOVED',
      });
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'SELLER_MEMBER_REMOVED',
      );
    });

    it('never removes the OWNER (exactly one owner per seller)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);

      await expect(service.removeMember({ ...command, memberIdentityId: OWNER })).rejects.toEqual(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies removing a non-member (non-enumerating)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile(5));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);

      await expect(service.removeMember(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });
  });
});
