/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { ApiIdempotencyPort } from '../../../identity-authentication/application/ports/api-idempotency.port';
import type { EnvelopeEncryptionPort } from '../../../identity-authentication/application/ports/envelope-encryption.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { SellerBusinessVerification } from '../../domain/entities/seller-business-verification';
import { SellerIdentityAssociation } from '../../domain/entities/seller-identity-association';
import { SellerProfile } from '../../domain/entities/seller-profile';
import { SellerStateTransition } from '../../domain/entities/seller-state-transition';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import type { Module01IdentityContractPort } from '../../domain/ports/module-01-contract.port';
import { SellerLifecycle } from '../../domain/lifecycle/seller-lifecycle';
import { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import { SellerCompliancePolicy } from '../../domain/policy/seller-compliance.policy';
import { SellerApplicationError } from '../errors/seller-application.error';
import type { SellerAdminAuthorizationPort } from '../ports/seller-admin-authorization.port';
import type { SellerEvidenceStoragePort } from '../ports/seller-evidence-storage.port';
import { SellerVerificationApplicationService } from './seller-verification-application.service';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const ORG = new UuidV7('0191310f-789a-7123-8123-000000000002');
const OWNER = new UuidV7('0191310f-789a-7123-8123-000000000003');
const MEMBER = new UuidV7('0191310f-789a-7123-8123-000000000004');
const REVIEWER = new UuidV7('0191310f-789a-7123-8123-000000000005');
const APPROVER = new UuidV7('0191310f-789a-7123-8123-000000000006');
const OTHER_ADMIN = new UuidV7('0191310f-789a-7123-8123-000000000007');
const NOW = new Date('2026-08-12T00:00:00.000Z');
const DIGEST = 'b'.repeat(64);

function uuid(seed: number): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function profile(
  state: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'CORRECTIONS_REQUESTED',
  version: number,
): SellerProfile {
  return new SellerProfile({
    sellerProfileId: SELLER,
    organizationId: ORG,
    state,
    complianceState: 'NOT_STARTED',
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

function submittedVerification(
  type: 'GST' | 'PAN' | 'BANK',
  generation = 1,
): SellerBusinessVerification {
  return new SellerBusinessVerification({
    verificationId: uuid(20),
    sellerProfileId: SELLER,
    verificationType: type,
    state: 'SUBMITTED',
    generation,
    submittedByIdentityId: OWNER,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function approvedVerifications(): SellerBusinessVerification[] {
  return (['GST', 'PAN', 'BANK'] as const).map(
    (type, index) =>
      new SellerBusinessVerification({
        verificationId: uuid(30 + index),
        sellerProfileId: SELLER,
        verificationType: type,
        state: 'APPROVED',
        generation: 1,
        submittedByIdentityId: OWNER,
        reviewedByIdentityId: APPROVER,
        reviewedAt: NOW,
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      }),
  );
}

function underReviewEpisode(reviewer: UuidV7): SellerStateTransition {
  return new SellerStateTransition({
    sellerStateTransitionId: uuid(40),
    sellerProfileId: SELLER,
    fromState: 'SUBMITTED',
    toState: 'UNDER_REVIEW',
    stateVersion: 2,
    actorIdentityId: reviewer,
    actorKind: 'ADMIN_REVIEWER',
    transitionedAt: NOW,
    createdAt: NOW,
  });
}

interface Harness {
  service: SellerVerificationApplicationService;
  repository: jest.Mocked<SellerProfileRepository>;
  module01: jest.Mocked<Module01IdentityContractPort>;
  adminAuthorization: jest.Mocked<SellerAdminAuthorizationPort>;
  evidenceStorage: jest.Mocked<SellerEvidenceStoragePort>;
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
    findActiveByRegistrationDigest: jest.fn(),
    findProfileByAssociatedIdentityId: jest.fn(),
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
  const adminAuthorization = {
    isGranted: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<SellerAdminAuthorizationPort>;
  const evidenceStorage = {
    verifyEvidenceIntegrity: jest.fn().mockResolvedValue(true),
    deleteEvidence: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SellerEvidenceStoragePort>;
  const rateLimiter = {
    consume: jest.fn().mockResolvedValue({ allowed: true, limit: 10, remaining: 9, resetAt: NOW }),
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
  const service = new SellerVerificationApplicationService(
    repository,
    module01,
    new SellerLifecycle(),
    new SellerAssociationPolicy(),
    new SellerCompliancePolicy(),
    adminAuthorization,
    evidenceStorage,
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
    idempotency,
    rateLimiter,
  );
  return {
    service,
    repository,
    module01,
    adminAuthorization,
    evidenceStorage,
    rateLimiter,
    idempotencyRepository,
  };
}

describe('SellerVerificationApplicationService (M03-M3, WEMP-M03-SPEC-001 §5/§12)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('submitVerification', () => {
    const command = {
      sellerProfileId: SELLER,
      actorIdentityId: OWNER,
      verificationType: 'GST' as const,
      expectedVersion: 1,
      evidence: [
        { evidenceType: 'GST_CERTIFICATE', evidenceReference: 'ref-1', evidenceDigest: DIGEST },
      ],
    };

    it('records evidence references and digests only, with integrity verification', async () => {
      const { service, repository, evidenceStorage } = harness();
      repository.findById.mockResolvedValue(profile('DRAFT', 1));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);
      repository.findVerifications.mockResolvedValue([submittedVerification('GST', 1)]);
      const result = await service.submitVerification(command);
      expect(result).toMatchObject({ state: 'SUBMITTED', generation: 2 });
      expect(evidenceStorage.verifyEvidenceIntegrity).toHaveBeenCalledWith('ref-1', DIGEST);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.verificationsToAppend[0]?.properties.generation).toBe(2);
      expect(changeSet?.evidenceToAppend[0]?.properties.evidenceReference).toBe('ref-1');
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'SELLER_VERIFICATION_SUBMITTED',
      );
    });

    it('fails closed when evidence integrity verification fails', async () => {
      const { service, repository, evidenceStorage } = harness();
      repository.findById.mockResolvedValue(profile('DRAFT', 1));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);
      evidenceStorage.verifyEvidenceIntegrity.mockResolvedValue(false);
      await expect(service.submitVerification(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_EVIDENCE_INTEGRITY_FAILED'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies a non-owner actor', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('DRAFT', 1));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);
      await expect(
        service.submitVerification({ ...command, actorIdentityId: MEMBER }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_OWNERSHIP_DENIED'));
    });

    it('rejects submission while the seller is locked for review', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 2));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);
      await expect(service.submitVerification({ ...command, expectedVersion: 2 })).rejects.toEqual(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a stale version', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('DRAFT', 2));
      await expect(service.submitVerification({ ...command, expectedVersion: 1 })).rejects.toEqual(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );
    });

    it('fails closed when the rate limiter denies the request', async () => {
      const { service, rateLimiter } = harness();
      rateLimiter.consume.mockResolvedValue({
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAt: NOW,
      });
      await expect(service.submitVerification(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_PRECONDITION_FAILED'),
      );
    });
  });

  describe('claimReview (SUBMITTED → UNDER_REVIEW)', () => {
    const command = { sellerProfileId: SELLER, reviewerIdentityId: REVIEWER, expectedVersion: 2 };

    it('claims review for a granted reviewer', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('SUBMITTED', 2));
      repository.findAssociations.mockResolvedValue([]);
      const result = await service.claimReview(command);
      expect(result).toEqual({ sellerProfileId: SELLER.value, state: 'UNDER_REVIEW', version: 3 });
      expect(repository.save.mock.calls[0]?.[1]).toEqual(new AggregateVersion(2));
    });

    it('denies a reviewer without seller.review.claim (fail closed)', async () => {
      const { service, adminAuthorization } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);
      await expect(service.claimReview(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );
    });

    it('denies a seller-associated identity from reviewing its own seller (SoD)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('SUBMITTED', 2));
      repository.findAssociations.mockResolvedValue([association(REVIEWER, 'OWNER')]);
      await expect(service.claimReview(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_SOD_VIOLATION'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a claim from the wrong lifecycle state', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('DRAFT', 1));
      await expect(service.claimReview({ ...command, expectedVersion: 1 })).rejects.toEqual(
        new SellerApplicationError('SELLER_STATE_CONFLICT'),
      );
    });
  });

  describe('requestCorrections (UNDER_REVIEW → CORRECTIONS_REQUESTED)', () => {
    const command = {
      sellerProfileId: SELLER,
      reviewerIdentityId: REVIEWER,
      expectedVersion: 3,
      reasonReference: 'WEMP-REQ-0001',
    };

    it('requests corrections with a mandatory reason reference', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 3));
      const result = await service.requestCorrections(command);
      expect(result.state).toBe('CORRECTIONS_REQUESTED');
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.transitionsToAppend[0]?.properties.reasonReference).toBe('WEMP-REQ-0001');
    });

    it('rejects corrections without a reason reference', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 3));
      await expect(
        service.requestCorrections({ ...command, reasonReference: '  ' }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_PRECONDITION_FAILED'));
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies an unauthorized reviewer', async () => {
      const { service, adminAuthorization } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);
      await expect(service.requestCorrections(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );
    });
  });

  describe('decideReview (UNDER_REVIEW → APPROVED | REJECTED)', () => {
    it('approves when approver ≠ reviewer and all mandatory verifications are approved', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 3));
      repository.findAssociations.mockResolvedValue([]);
      repository.findTransitions.mockResolvedValue([underReviewEpisode(REVIEWER)]);
      repository.findVerifications.mockResolvedValue(approvedVerifications());
      const result = await service.decideReview({
        sellerProfileId: SELLER,
        approverIdentityId: APPROVER,
        expectedVersion: 3,
        decision: 'APPROVED',
      });
      expect(result.state).toBe('APPROVED');
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.transitionsToAppend[0]?.properties.actorKind).toBe('ADMIN_APPROVER');
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('SELLER_APPROVED');
    });

    it('rejects with a mandatory reason reference', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 3));
      repository.findAssociations.mockResolvedValue([]);
      repository.findTransitions.mockResolvedValue([underReviewEpisode(REVIEWER)]);
      const result = await service.decideReview({
        sellerProfileId: SELLER,
        approverIdentityId: APPROVER,
        expectedVersion: 3,
        decision: 'REJECTED',
        reasonReference: 'WEMP-REJ-0001',
      });
      expect(result.state).toBe('REJECTED');
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects a REJECTED decision without a reason', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 3));
      await expect(
        service.decideReview({
          sellerProfileId: SELLER,
          approverIdentityId: APPROVER,
          expectedVersion: 3,
          decision: 'REJECTED',
        }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_PRECONDITION_FAILED'));
    });

    it('denies self-approval where approver === reviewer (SoD, D-08)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 3));
      repository.findAssociations.mockResolvedValue([]);
      repository.findTransitions.mockResolvedValue([underReviewEpisode(REVIEWER)]);
      repository.findVerifications.mockResolvedValue(approvedVerifications());
      await expect(
        service.decideReview({
          sellerProfileId: SELLER,
          approverIdentityId: REVIEWER,
          expectedVersion: 3,
          decision: 'APPROVED',
        }),
      ).rejects.toMatchObject({ name: 'SellerDomainError', code: 'SELLER_SOD_VIOLATION' });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies approval by a seller-associated identity (applicant can never approve)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 3));
      repository.findAssociations.mockResolvedValue([association(APPROVER, 'MEMBER')]);
      await expect(
        service.decideReview({
          sellerProfileId: SELLER,
          approverIdentityId: APPROVER,
          expectedVersion: 3,
          decision: 'APPROVED',
        }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_SOD_VIOLATION'));
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('fails closed when no reviewer episode exists (SoD provenance)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 3));
      repository.findAssociations.mockResolvedValue([]);
      repository.findTransitions.mockResolvedValue([]);
      await expect(
        service.decideReview({
          sellerProfileId: SELLER,
          approverIdentityId: APPROVER,
          expectedVersion: 3,
          decision: 'REJECTED',
          reasonReference: 'WEMP-REJ-0002',
        }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_SOD_VIOLATION'));
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects approval while mandatory verifications are not approved (fail closed)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW', 3));
      repository.findAssociations.mockResolvedValue([]);
      repository.findTransitions.mockResolvedValue([underReviewEpisode(REVIEWER)]);
      repository.findVerifications.mockResolvedValue([submittedVerification('GST')]);
      await expect(
        service.decideReview({
          sellerProfileId: SELLER,
          approverIdentityId: APPROVER,
          expectedVersion: 3,
          decision: 'APPROVED',
        }),
      ).rejects.toMatchObject({ name: 'SellerDomainError', code: 'SELLER_PRECONDITION_FAILED' });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies an approver without seller.review.decide', async () => {
      const { service, adminAuthorization } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);
      await expect(
        service.decideReview({
          sellerProfileId: SELLER,
          approverIdentityId: APPROVER,
          expectedVersion: 3,
          decision: 'APPROVED',
        }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'));
    });
  });

  describe('getVerificationStatus', () => {
    it('returns a non-enumerating status to an associated caller', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('SUBMITTED', 2));
      repository.findAssociations.mockResolvedValue([association(MEMBER, 'MEMBER')]);
      repository.findVerifications.mockResolvedValue(approvedVerifications());
      const result = await service.getVerificationStatus(SELLER, MEMBER);
      expect(result.complianceState).toBe('COMPLIANT');
      expect(result.verifications).toHaveLength(3);
      expect(JSON.stringify(result)).not.toContain('evidenceReference');
      expect(JSON.stringify(result)).not.toContain(DIGEST);
    });

    it('denies a caller with no active association', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('SUBMITTED', 2));
      repository.findAssociations.mockResolvedValue([]);
      await expect(service.getVerificationStatus(SELLER, OTHER_ADMIN)).rejects.toEqual(
        new SellerApplicationError('SELLER_OWNERSHIP_DENIED'),
      );
    });

    it('returns SELLER_NOT_FOUND for an unknown seller (non-enumerating)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(null);
      await expect(service.getVerificationStatus(SELLER, MEMBER)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });
  });
});
