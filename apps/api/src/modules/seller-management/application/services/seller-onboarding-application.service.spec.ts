/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../../identity-authentication/domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { ApiIdempotencyPort } from '../../../identity-authentication/application/ports/api-idempotency.port';
import type { EnvelopeEncryptionPort } from '../../../identity-authentication/application/ports/envelope-encryption.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { SellerBusinessVerification } from '../../domain/entities/seller-business-verification';
import { SellerIdentityAssociation } from '../../domain/entities/seller-identity-association';
import { SellerOrganization } from '../../domain/entities/seller-organization';
import { SellerProfile } from '../../domain/entities/seller-profile';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import type { Module01IdentityContractPort } from '../../domain/ports/module-01-contract.port';
import { SellerLifecycle } from '../../domain/lifecycle/seller-lifecycle';
import { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import { SellerCompliancePolicy } from '../../domain/policy/seller-compliance.policy';
import { SellerApplicationError } from '../errors/seller-application.error';
import { SellerOnboardingApplicationService } from './seller-onboarding-application.service';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const ORG = new UuidV7('0191310f-789a-7123-8123-000000000002');
const OWNER = new UuidV7('0191310f-789a-7123-8123-000000000003');
const MEMBER = new UuidV7('0191310f-789a-7123-8123-000000000004');
const NOW = new Date('2026-08-12T00:00:00.000Z');
const DIGEST = 'a'.repeat(64);

function uuid(seed: number): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function draftProfile(): SellerProfile {
  return new SellerProfile({
    sellerProfileId: SELLER,
    organizationId: ORG,
    state: 'DRAFT',
    complianceState: 'NOT_STARTED',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function correctionsProfile(): SellerProfile {
  return new SellerProfile({
    ...draftProfile().properties,
    state: 'CORRECTIONS_REQUESTED',
    aggregateVersion: new AggregateVersion(2),
    updatedAt: NOW,
  });
}

function submittedProfile(): SellerProfile {
  return new SellerProfile({
    ...draftProfile().properties,
    state: 'SUBMITTED',
    aggregateVersion: new AggregateVersion(2),
    updatedAt: NOW,
  });
}

function activeProfile(): SellerProfile {
  return new SellerProfile({
    ...draftProfile().properties,
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(2),
    updatedAt: NOW,
  });
}

function ownerAssociation(): SellerIdentityAssociation {
  return new SellerIdentityAssociation({
    associationId: uuid(5),
    sellerProfileId: SELLER,
    identityId: OWNER,
    associationRole: 'OWNER',
    isPrimary: true,
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function organization(): SellerOrganization {
  return new SellerOrganization({
    organizationId: ORG,
    legalName: 'Walrus Retail Pvt Ltd',
    tradeName: 'Walrus Retail',
    registrationLookupDigest: DIGEST,
    registrationNumber: new ProtectedValue('GSTIN1234567890123'),
    businessAddress: '1 Market Street, Bengaluru',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function submittedVerification(): SellerBusinessVerification {
  return new SellerBusinessVerification({
    verificationId: uuid(6),
    sellerProfileId: SELLER,
    verificationType: 'GST',
    state: 'SUBMITTED',
    generation: 1,
    submittedByIdentityId: OWNER,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface Harness {
  service: SellerOnboardingApplicationService;
  repository: jest.Mocked<SellerProfileRepository>;
  module01: jest.Mocked<Module01IdentityContractPort>;
  rateLimiter: jest.Mocked<NonProductionRateLimiterPort>;
  idempotencyRepository: jest.Mocked<ApiIdempotencyPort>;
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
    findActiveByRegistrationDigest: jest.fn().mockResolvedValue(null),
    findProfileByAssociatedIdentityId: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SellerProfileRepository>;
  const module01 = {
    getIdentityEligibility: jest.fn().mockResolvedValue({
      identityId: OWNER,
      state: 'ACTIVE',
      verificationState: 'VERIFIED',
    }),
  } as unknown as jest.Mocked<Module01IdentityContractPort>;
  const rateLimiter = {
    consume: jest.fn().mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: NOW,
    }),
  } as unknown as jest.Mocked<NonProductionRateLimiterPort>;
  const idempotencyRepository = {
    acquire: jest.fn().mockResolvedValue({ outcome: 'ACQUIRED' }),
    complete: jest.fn().mockResolvedValue(undefined),
    abandon: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ApiIdempotencyPort>;
  const encryption = {
    encrypt: jest.fn((value: Uint8Array) => ({ value: Buffer.from(value).toString('base64') })),
    decrypt: jest.fn((value: { value: string }) => Buffer.from(value.value, 'base64')),
  } as unknown as jest.Mocked<EnvelopeEncryptionPort>;
  const idempotency = new ApiIdempotencyService(
    idempotencyRepository,
    encryption,
    { now: () => NOW },
    { next: () => new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000901') },
  );
  let uuidCounter = 100;
  const service = new SellerOnboardingApplicationService(
    repository,
    module01,
    new SellerLifecycle(),
    new SellerAssociationPolicy(),
    new SellerCompliancePolicy(),
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
    idempotency,
    rateLimiter,
  );
  return { service, repository, module01, rateLimiter, idempotencyRepository };
}

describe('SellerOnboardingApplicationService (M03-M3, WEMP-M03-SPEC-001 §4/§7)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('requestSellerProfileCreation', () => {
    const command = {
      identityId: OWNER,
      legalName: 'Walrus Retail Pvt Ltd',
      tradeName: 'Walrus Retail',
      registrationNumber: 'GSTIN1234567890123',
      registrationLookupDigest: DIGEST,
      businessAddress: '1 Market Street, Bengaluru',
    };

    it('creates a DRAFT profile with the OWNER association and initial episode', async () => {
      const { service, repository, idempotencyRepository } = harness();
      const result = await service.requestSellerProfileCreation(command);
      expect(typeof result.sellerProfileId).toBe('string');
      expect(result).toEqual({
        sellerProfileId: result.sellerProfileId,
        state: 'DRAFT',
        version: 1,
      });
      expect(repository.insert).toHaveBeenCalledTimes(1);
      const changeSet = repository.insert.mock.calls[0]?.[0];
      expect(changeSet?.sellerProfile.properties.state).toBe('DRAFT');
      expect(changeSet?.organization?.properties.legalName).toBe('Walrus Retail Pvt Ltd');
      expect(changeSet?.associationsToAppend).toHaveLength(1);
      expect(changeSet?.associationsToAppend[0]?.properties.associationRole).toBe('OWNER');
      expect(changeSet?.transitionsToAppend).toHaveLength(1);
      expect(changeSet?.transitionsToAppend[0]?.properties.toState).toBe('DRAFT');
      expect(changeSet?.auditRecordsToAppend).toHaveLength(1);
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'SELLER_ONBOARDING_CREATED',
      );
      expect(idempotencyRepository.complete).toHaveBeenCalledTimes(1);
    });

    it('denies an identity that is not ACTIVE (fail closed)', async () => {
      const { service, module01 } = harness();
      module01.getIdentityEligibility.mockResolvedValue({
        identityId: OWNER,
        state: 'LOCKED',
        verificationState: 'VERIFIED',
      });
      await expect(service.requestSellerProfileCreation(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE'),
      );
    });

    it('denies an identity that is not VERIFIED', async () => {
      const { service, module01 } = harness();
      module01.getIdentityEligibility.mockResolvedValue({
        identityId: OWNER,
        state: 'ACTIVE',
        verificationState: 'PENDING_VERIFICATION',
      });
      await expect(service.requestSellerProfileCreation(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE'),
      );
    });

    it('rejects duplicate seller per identity (D-02)', async () => {
      const { service, repository } = harness();
      repository.findProfileByAssociatedIdentityId.mockResolvedValue(draftProfile());
      await expect(service.requestSellerProfileCreation(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_DUPLICATE_DETECTED'),
      );
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('rejects duplicate active business by registration digest (D-02)', async () => {
      const { service, repository } = harness();
      repository.findActiveByRegistrationDigest.mockResolvedValue(activeProfile());
      await expect(service.requestSellerProfileCreation(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_DUPLICATE_DETECTED'),
      );
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('fails closed when the rate limiter denies the request', async () => {
      const { service, rateLimiter } = harness();
      rateLimiter.consume.mockResolvedValue({
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAt: NOW,
      });
      await expect(service.requestSellerProfileCreation(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_PRECONDITION_FAILED'),
      );
    });
  });

  describe('submitOnboarding (DRAFT → SUBMITTED)', () => {
    const command = { sellerProfileId: SELLER, actorIdentityId: OWNER, expectedVersion: 1 };

    it('submits a complete DRAFT to SUBMITTED with audit', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(draftProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      repository.findOrganization.mockResolvedValue(organization());
      repository.findVerifications.mockResolvedValue([submittedVerification()]);
      const result = await service.submitOnboarding(command);
      expect(result.state).toBe('SUBMITTED');
      expect(result.version).toBe(2);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.transitionsToAppend).toHaveLength(1);
      expect(changeSet?.transitionsToAppend[0]?.properties.toState).toBe('SUBMITTED');
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'SELLER_ONBOARDING_SUBMITTED',
      );
      expect(repository.save.mock.calls[0]?.[1]).toEqual(new AggregateVersion(1));
    });

    it('rejects a submission without onboarding completeness (fail closed)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(draftProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      repository.findOrganization.mockResolvedValue(organization());
      repository.findVerifications.mockResolvedValue([]);
      await expect(service.submitOnboarding(command)).rejects.toMatchObject({
        name: 'SellerDomainError',
        code: 'SELLER_PRECONDITION_FAILED',
      });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies a non-owner actor (ownership enforcement)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(draftProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      await expect(
        service.submitOnboarding({ ...command, actorIdentityId: MEMBER }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_OWNERSHIP_DENIED'));
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a stale version (optimistic concurrency)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(submittedProfile());
      await expect(service.submitOnboarding({ ...command, expectedVersion: 1 })).rejects.toEqual(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects an invalid lifecycle state', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(submittedProfile());
      await expect(service.submitOnboarding({ ...command, expectedVersion: 2 })).rejects.toEqual(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );
    });

    it('denies an ineligible identity at submission', async () => {
      const { service, repository, module01 } = harness();
      repository.findById.mockResolvedValue(draftProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module01.getIdentityEligibility.mockResolvedValue({
        identityId: OWNER,
        state: 'SUSPENDED',
        verificationState: 'VERIFIED',
      });
      await expect(service.submitOnboarding(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE'),
      );
    });

    it('replays an idempotent duplicate request without a second mutation', async () => {
      const { service, repository, idempotencyRepository } = harness();
      idempotencyRepository.acquire.mockResolvedValue({
        outcome: 'COMPLETED',
        protectedResultReference: JSON.stringify({
          envelopeVersion: 'walrus-envelope-v1',
          value: Buffer.from(
            JSON.stringify({ sellerProfileId: SELLER.value, state: 'SUBMITTED', version: 2 }),
          ).toString('base64'),
        }),
      });
      repository.findById.mockResolvedValue(draftProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      const result = await service.submitOnboarding(command);
      expect(result).toEqual({ sellerProfileId: SELLER.value, state: 'SUBMITTED', version: 2 });
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.findOrganization).not.toHaveBeenCalled();
    });

    it('propagates a persistence/audit failure and abandons the idempotency record', async () => {
      const { service, repository, idempotencyRepository } = harness();
      repository.findById.mockResolvedValue(draftProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      repository.findOrganization.mockResolvedValue(organization());
      repository.findVerifications.mockResolvedValue([submittedVerification()]);
      repository.save.mockRejectedValue(new Error('db unavailable'));
      await expect(service.submitOnboarding(command)).rejects.toThrow('db unavailable');
      expect(idempotencyRepository.abandon).toHaveBeenCalledTimes(1);
    });
  });

  describe('resubmitOnboarding (CORRECTIONS_REQUESTED → SUBMITTED)', () => {
    it('resubmits a corrections cycle', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(correctionsProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      const result = await service.resubmitOnboarding({
        sellerProfileId: SELLER,
        actorIdentityId: OWNER,
        expectedVersion: 2,
      });
      expect(result.state).toBe('SUBMITTED');
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects resubmission from a non-corrections state', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(draftProfile());
      await expect(
        service.resubmitOnboarding({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          expectedVersion: 1,
        }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_STATE_CONFLICT'));
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('updates business information with a version guard and audit', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(activeProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      repository.findOrganization.mockResolvedValue(organization());
      const result = await service.updateProfile({
        sellerProfileId: SELLER,
        actorIdentityId: OWNER,
        expectedVersion: 2,
        tradeName: 'Walrus Retail (Rebranded)',
      });
      expect(result.state).toBe('ACTIVE');
      expect(result.version).toBe(3);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.organization?.properties.tradeName).toBe('Walrus Retail (Rebranded)');
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'SELLER_PROFILE_UPDATED',
      );
      // No lifecycle episode for an information-only update.
      expect(changeSet?.transitionsToAppend).toHaveLength(0);
    });

    it('denies updates while the seller is locked for review', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(submittedProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      await expect(
        service.updateProfile({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          expectedVersion: 2,
          tradeName: 'x',
        }),
      ).rejects.toMatchObject({ name: 'SellerDomainError', code: 'SELLER_UPDATE_FORBIDDEN' });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies a non-owner actor', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(activeProfile());
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      await expect(
        service.updateProfile({
          sellerProfileId: SELLER,
          actorIdentityId: MEMBER,
          expectedVersion: 2,
          tradeName: 'x',
        }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_OWNERSHIP_DENIED'));
    });

    it('rejects a stale version', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(activeProfile());
      await expect(
        service.updateProfile({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          expectedVersion: 1,
          tradeName: 'x',
        }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_STATE_CONFLICT'));
    });

    it('returns SELLER_NOT_FOUND for an unknown seller', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(null);
      await expect(
        service.updateProfile({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          expectedVersion: 1,
        }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_NOT_FOUND'));
    });
  });
});
