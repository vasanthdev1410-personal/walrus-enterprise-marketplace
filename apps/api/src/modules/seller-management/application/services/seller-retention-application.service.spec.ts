/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerBusinessVerification } from '../../domain/entities/seller-business-verification';
import { SellerEvidenceLegalHold } from '../../domain/entities/seller-evidence-legal-hold';
import { SellerProfile } from '../../domain/entities/seller-profile';
import { SellerVerificationEvidence } from '../../domain/entities/seller-verification-evidence';
import type { SellerLegalHoldRepository } from '../../domain/ports/seller-legal-hold-repository.port';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import type { Module01IdentityContractPort } from '../../domain/ports/module-01-contract.port';
import { SellerRetentionPolicy } from '../../domain/policy/seller-retention.policy';
import { SellerApplicationError } from '../errors/seller-application.error';
import type { EvidenceRetentionConfigurationPort } from '../ports/evidence-retention-configuration.port';
import type { SellerAdminAuthorizationPort } from '../ports/seller-admin-authorization.port';
import type { SellerEvidenceStoragePort } from '../ports/seller-evidence-storage.port';
import { SellerRetentionApplicationService } from './seller-retention-application.service';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const ORG = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ADMIN = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NOW = new Date('2026-08-12T00:00:00.000Z');
const UPLOADED = new Date('2026-07-01T00:00:00.000Z'); // ~42 days before NOW (within 365-day window)
const OLD_UPLOAD = new Date('2024-08-12T00:00:00.000Z'); // ~730 days before NOW (expired)
const DIGEST = 'c'.repeat(64);

function uuid(seed: number): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function profile(): SellerProfile {
  return new SellerProfile({
    sellerProfileId: SELLER,
    organizationId: ORG,
    state: 'ACTIVE',
    complianceState: 'COMPLIANT',
    aggregateVersion: new AggregateVersion(4),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function verification(): SellerBusinessVerification {
  return new SellerBusinessVerification({
    verificationId: uuid(10),
    sellerProfileId: SELLER,
    verificationType: 'GST',
    state: 'APPROVED',
    generation: 1,
    submittedByIdentityId: ADMIN,
    reviewedByIdentityId: ADMIN,
    reviewedAt: NOW,
    aggregateVersion: new AggregateVersion(1),
    createdAt: UPLOADED,
    updatedAt: UPLOADED,
  });
}

function evidence(uploadedAt: Date, evidenceType = 'GST_CERTIFICATE'): SellerVerificationEvidence {
  return new SellerVerificationEvidence({
    evidenceId: uuid(11),
    verificationId: uuid(10),
    evidenceType,
    evidenceReference: `ref-${evidenceType}`,
    evidenceDigest: DIGEST,
    uploadedByIdentityId: ADMIN,
    uploadedAt,
    createdAt: uploadedAt,
  });
}

function activeHold(): SellerEvidenceLegalHold {
  return new SellerEvidenceLegalHold({
    legalHoldId: uuid(12),
    sellerProfileId: SELLER,
    authorizedByIdentityId: ADMIN,
    reasonReference: 'WEMP-LIT-2026-0001',
    active: true,
    placedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface Harness {
  service: SellerRetentionApplicationService;
  repository: jest.Mocked<SellerProfileRepository>;
  legalHolds: jest.Mocked<SellerLegalHoldRepository>;
  module01: jest.Mocked<Module01IdentityContractPort>;
  retentionConfiguration: jest.Mocked<EvidenceRetentionConfigurationPort>;
  evidenceStorage: jest.Mocked<SellerEvidenceStoragePort>;
  adminAuthorization: jest.Mocked<SellerAdminAuthorizationPort>;
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
  const legalHolds = {
    findActiveBySellerProfileId: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SellerLegalHoldRepository>;
  const module01 = {
    getIdentityEligibility: jest.fn().mockResolvedValue({
      identityId: ADMIN,
      state: 'ACTIVE',
      verificationState: 'VERIFIED',
    }),
  } as unknown as jest.Mocked<Module01IdentityContractPort>;
  const retentionConfiguration = {
    findRule: jest.fn().mockResolvedValue({ category: 'GST_CERTIFICATE', retentionDays: 365 }),
  } as unknown as jest.Mocked<EvidenceRetentionConfigurationPort>;
  const evidenceStorage = {
    verifyEvidenceIntegrity: jest.fn().mockResolvedValue(true),
    deleteEvidence: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SellerEvidenceStoragePort>;
  const adminAuthorization = {
    isGranted: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<SellerAdminAuthorizationPort>;
  let uuidCounter = 100;
  const service = new SellerRetentionApplicationService(
    repository,
    legalHolds,
    module01,
    retentionConfiguration,
    evidenceStorage,
    new SellerRetentionPolicy(),
    adminAuthorization,
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
  );
  return {
    service,
    repository,
    legalHolds,
    module01,
    retentionConfiguration,
    evidenceStorage,
    adminAuthorization,
  };
}

describe('SellerRetentionApplicationService (M03-M3, D-03, WEMP-M03-SPEC-001)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('placeLegalHold', () => {
    const command = {
      sellerProfileId: SELLER,
      authorizedByIdentityId: ADMIN,
      reasonReference: 'WEMP-LIT-2026-0001',
    };

    it('places an active hold and records an audit event', async () => {
      const { service, repository, legalHolds } = harness();
      repository.findById.mockResolvedValue(profile());
      const result = await service.placeLegalHold(command);
      expect(result).toEqual({ sellerProfileId: SELLER.value, active: true });
      expect(legalHolds.insert).toHaveBeenCalledTimes(1);
      const hold = legalHolds.insert.mock.calls[0]?.[0];
      expect(hold).toBeDefined();
      expect(hold?.properties.active).toBe(true);
      expect(hold?.properties.reasonReference).toBe('WEMP-LIT-2026-0001');
      expect(repository.save.mock.calls[0]?.[0].auditRecordsToAppend[0]?.properties.eventType).toBe(
        'SELLER_LEGAL_HOLD_PLACED',
      );
    });

    it('denies an identity without seller.legalhold.manage', async () => {
      const { service, adminAuthorization, legalHolds } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);
      await expect(service.placeLegalHold(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );
      expect(legalHolds.insert).not.toHaveBeenCalled();
    });

    it('fails closed when a hold is already active (no silent overwrite)', async () => {
      const { service, legalHolds } = harness();
      legalHolds.findActiveBySellerProfileId.mockResolvedValue(activeHold());
      await expect(service.placeLegalHold(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_LEGAL_HOLD_CONFLICT'),
      );
      expect(legalHolds.insert).not.toHaveBeenCalled();
    });

    it('returns SELLER_NOT_FOUND for an unknown seller', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(null);
      await expect(service.placeLegalHold(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });
  });

  describe('releaseLegalHold', () => {
    const command = { sellerProfileId: SELLER, releasedByIdentityId: ADMIN };

    it('releases an active hold and records who/when', async () => {
      const { service, legalHolds, repository } = harness();
      legalHolds.findActiveBySellerProfileId.mockResolvedValue(activeHold());
      repository.findById.mockResolvedValue(profile());
      const result = await service.releaseLegalHold(command);
      expect(result).toEqual({ sellerProfileId: SELLER.value, active: false });
      const saved = legalHolds.save.mock.calls[0]?.[0];
      expect(saved).toBeDefined();
      expect(saved?.properties.active).toBe(false);
      expect(saved?.properties.releasedByIdentityId).toEqual(ADMIN);
      expect(saved?.properties.releasedAt).toEqual(NOW);
      expect(repository.save.mock.calls[0]?.[0].auditRecordsToAppend[0]?.properties.eventType).toBe(
        'SELLER_LEGAL_HOLD_RELEASED',
      );
    });

    it('denies an unauthorized identity', async () => {
      const { service, adminAuthorization } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);
      await expect(service.releaseLegalHold(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );
    });

    it('fails closed when no active hold exists', async () => {
      const { service } = harness();
      await expect(service.releaseLegalHold(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_LEGAL_HOLD_CONFLICT'),
      );
    });
  });

  describe('processEvidenceRetention', () => {
    const command = { sellerProfileId: SELLER, triggeredByIdentityId: ADMIN };

    it('deletes expired evidence through storage and audits each deletion', async () => {
      const { service, repository, evidenceStorage } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findVerifications.mockResolvedValue([verification()]);
      repository.findEvidence.mockResolvedValue([evidence(OLD_UPLOAD)]);
      const result = await service.processEvidenceRetention(command);
      expect(result.evidenceChecked).toBe(1);
      expect(result.evidenceExpired).toBe(1);
      expect(result.evidenceHeld).toBe(0);
      expect(evidenceStorage.deleteEvidence).toHaveBeenCalledWith('ref-GST_CERTIFICATE', SELLER);
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe(
        'SELLER_EVIDENCE_RETENTION_EXPIRED',
      );
      // Only the digest is referenced in the audit trail — never content.
      expect(changeSet?.auditRecordsToAppend[0]?.properties.evidenceDigest).toBe(DIGEST);
      expect(repository.save.mock.calls[0]?.[1]).toEqual(new AggregateVersion(4));
    });

    it('keeps evidence within its retention window', async () => {
      const { service, evidenceStorage, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findVerifications.mockResolvedValue([verification()]);
      repository.findEvidence.mockResolvedValue([evidence(UPLOADED)]);
      const result = await service.processEvidenceRetention(command);
      expect(result.evidenceExpired).toBe(0);
      expect(evidenceStorage.deleteEvidence).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('an active legal hold forces HELD and never deletes', async () => {
      const { service, legalHolds, evidenceStorage, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findVerifications.mockResolvedValue([verification()]);
      repository.findEvidence.mockResolvedValue([evidence(OLD_UPLOAD)]);
      legalHolds.findActiveBySellerProfileId.mockResolvedValue(activeHold());
      const result = await service.processEvidenceRetention(command);
      expect(result.evidenceHeld).toBe(1);
      expect(result.evidenceExpired).toBe(0);
      expect(evidenceStorage.deleteEvidence).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('fails the whole run before deleting when a category rule is missing', async () => {
      const { service, repository, retentionConfiguration, evidenceStorage } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findVerifications.mockResolvedValue([verification()]);
      repository.findEvidence.mockResolvedValue([evidence(OLD_UPLOAD, 'UNCLASSIFIED_DOC')]);
      retentionConfiguration.findRule.mockResolvedValue(undefined);
      await expect(service.processEvidenceRetention(command)).rejects.toMatchObject({
        name: 'SellerDomainError',
        code: 'SELLER_RETENTION_CONFIG_MISSING',
      });
      expect(evidenceStorage.deleteEvidence).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('fails the whole run before deleting when a rule is invalid', async () => {
      const { service, repository, retentionConfiguration, evidenceStorage } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findVerifications.mockResolvedValue([verification()]);
      repository.findEvidence.mockResolvedValue([evidence(OLD_UPLOAD)]);
      retentionConfiguration.findRule.mockResolvedValue({
        category: 'GST_CERTIFICATE',
        retentionDays: 0,
      });
      await expect(service.processEvidenceRetention(command)).rejects.toMatchObject({
        name: 'SellerDomainError',
        code: 'SELLER_RETENTION_CONFIG_INVALID',
      });
      expect(evidenceStorage.deleteEvidence).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies an ineligible trigger identity', async () => {
      const { service, module01, evidenceStorage } = harness();
      module01.getIdentityEligibility.mockResolvedValue({
        identityId: ADMIN,
        state: 'DISABLED',
        verificationState: 'VERIFIED',
      });
      await expect(service.processEvidenceRetention(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE'),
      );
      expect(evidenceStorage.deleteEvidence).not.toHaveBeenCalled();
    });

    it('returns SELLER_NOT_FOUND for an unknown seller', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(null);
      await expect(service.processEvidenceRetention(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });

    it('releases the legal-hold state after release (normal retention resumes)', async () => {
      const { service, legalHolds, evidenceStorage, repository } = harness();
      repository.findById.mockResolvedValue(profile());
      repository.findVerifications.mockResolvedValue([verification()]);
      repository.findEvidence.mockResolvedValue([evidence(OLD_UPLOAD)]);
      // The hold was released: only the released record remains (inactive).
      legalHolds.findActiveBySellerProfileId.mockResolvedValue(null);
      legalHolds.save.mockResolvedValue(undefined);
      const result = await service.processEvidenceRetention(command);
      expect(result.evidenceExpired).toBe(1);
      expect(evidenceStorage.deleteEvidence).toHaveBeenCalledTimes(1);
    });
  });
});
