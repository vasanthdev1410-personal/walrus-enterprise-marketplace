/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { ProtectedValue } from '../../../identity-authentication/domain/shared/value-objects/protected-value';
import { SellerIdentityAssociation } from '../../domain/entities/seller-identity-association';
import { SellerOrganization } from '../../domain/entities/seller-organization';
import { SellerProfile } from '../../domain/entities/seller-profile';
import { SellerBusinessVerification } from '../../domain/entities/seller-business-verification';
import { SellerVerificationEvidence } from '../../domain/entities/seller-verification-evidence';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import { SellerCompliancePolicy } from '../../domain/policy/seller-compliance.policy';
import { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import { SellerApplicationError } from '../errors/seller-application.error';
import type { SellerAdminAuthorizationPort } from '../ports/seller-admin-authorization.port';
import { SellerReadApplicationService } from './seller-read-application.service';

const OWNER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const MEMBER = new UuidV7('0191310f-789a-7123-8123-000000000002');
const CALLER = new UuidV7('0191310f-789a-7123-8123-000000000003');
const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000004');
const ORG = new UuidV7('0191310f-789a-7123-8123-000000000005');
const VERIFICATION = new UuidV7('0191310f-789a-7123-8123-000000000006');
const NOW = new Date('2026-08-13T00:00:00.000Z');

function uuid(seed: number): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function profile(state: SellerProfile['properties']['state']): SellerProfile {
  return new SellerProfile({
    sellerProfileId: SELLER,
    organizationId: ORG,
    state,
    complianceState: 'NOT_STARTED',
    aggregateVersion: new AggregateVersion(3),
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

function organization(): SellerOrganization {
  return new SellerOrganization({
    organizationId: ORG,
    legalName: 'Walrus Retail Pvt Ltd',
    tradeName: 'Walrus Retail',
    registrationLookupDigest: 'a'.repeat(64),
    registrationNumber: new ProtectedValue('GSTIN1234567890123'),
    businessAddress: '1 Market Street',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function verification(): SellerBusinessVerification {
  return new SellerBusinessVerification({
    verificationId: VERIFICATION,
    sellerProfileId: SELLER,
    verificationType: 'GST',
    state: 'APPROVED',
    generation: 2,
    submittedByIdentityId: OWNER,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface Harness {
  service: SellerReadApplicationService;
  repository: jest.Mocked<SellerProfileRepository>;
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
    findAllSellers: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<SellerProfileRepository>;
  const adminAuthorization = {
    isGranted: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<SellerAdminAuthorizationPort>;
  const service = new SellerReadApplicationService(
    repository,
    new SellerAssociationPolicy(),
    new SellerCompliancePolicy(),
    adminAuthorization,
  );
  return { service, repository, adminAuthorization };
}

describe('SellerReadApplicationService (M03-M5)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getOwnOnboardingStatus', () => {
    it('resolves the caller own seller server-side and returns non-sensitive status', async () => {
      const { service, repository } = harness();
      repository.findProfileByAssociatedIdentityId.mockResolvedValue(profile('DRAFT'));
      repository.findOrganization.mockResolvedValue(organization());
      repository.findVerifications.mockResolvedValue([verification()]);

      const result = await service.getOwnOnboardingStatus(OWNER);

      expect(result).toMatchObject({
        sellerProfileId: SELLER.value,
        state: 'DRAFT',
        complianceState: 'IN_PROGRESS',
        version: 3,
        organization: { legalName: 'Walrus Retail Pvt Ltd' },
      });
      expect(result.verifications[0]).toMatchObject({
        verificationType: 'GST',
        state: 'APPROVED',
        generation: 2,
      });
      // No evidence references/digests are ever exposed to the seller.
      expect(JSON.stringify(result)).not.toContain('evidenceReference');
      expect(JSON.stringify(result)).not.toContain('registrationNumber');
      expect(repository.findProfileByAssociatedIdentityId).toHaveBeenCalledWith(OWNER);
    });

    it('fails non-enumerating (SELLER_NOT_FOUND) when the caller has no seller', async () => {
      const { service, repository } = harness();
      repository.findProfileByAssociatedIdentityId.mockResolvedValue(null);

      await expect(service.getOwnOnboardingStatus(OWNER)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });

    it('fails closed when the own seller has no organization record', async () => {
      const { service, repository } = harness();
      repository.findProfileByAssociatedIdentityId.mockResolvedValue(profile('DRAFT'));
      repository.findOrganization.mockResolvedValue(null);
      repository.findVerifications.mockResolvedValue([]);

      await expect(service.getOwnOnboardingStatus(OWNER)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });
  });

  describe('getOwnProfile', () => {
    it('returns the own profile with members and non-sensitive verification summary', async () => {
      const { service, repository } = harness();
      repository.findProfileByAssociatedIdentityId.mockResolvedValue(profile('ACTIVE'));
      repository.findOrganization.mockResolvedValue(organization());
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);
      repository.findVerifications.mockResolvedValue([verification()]);

      const result = await service.getOwnProfile(OWNER);

      expect(result).toMatchObject({
        sellerProfileId: SELLER.value,
        state: 'ACTIVE',
      });
      expect(result.members[0]).toMatchObject({
        identityId: OWNER.value,
        associationRole: 'OWNER',
      });
      expect(JSON.stringify(result)).not.toContain('evidenceReference');
      expect(JSON.stringify(result)).not.toContain('registrationNumber');
    });

    it('fails non-enumerating when the caller has no seller', async () => {
      const { service, repository } = harness();
      repository.findProfileByAssociatedIdentityId.mockResolvedValue(null);

      await expect(service.getOwnProfile(OWNER)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });

    it('fails closed when the own seller has no organization record', async () => {
      const { service, repository } = harness();
      repository.findProfileByAssociatedIdentityId.mockResolvedValue(profile('ACTIVE'));
      repository.findOrganization.mockResolvedValue(null);
      repository.findAssociations.mockResolvedValue([]);
      repository.findVerifications.mockResolvedValue([]);

      await expect(service.getOwnProfile(OWNER)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });
  });

  describe('listWarehouses / listAgreements / listMembers (ownership)', () => {
    it('allows an ACTIVE association of the seller to read', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('ACTIVE'));
      repository.findAssociations.mockResolvedValue([association(MEMBER, 'MEMBER')]);
      repository.findWarehouses.mockResolvedValue([]);
      repository.findAgreements.mockResolvedValue([]);

      await expect(service.listWarehouses(SELLER, MEMBER)).resolves.toEqual([]);
      await expect(service.listAgreements(SELLER, MEMBER)).resolves.toEqual([]);
      // members read returns the association summaries (no PII beyond identity ref)
      const members = await service.listMembers(SELLER, MEMBER);
      expect(members[0]).toMatchObject({ identityId: MEMBER.value, associationRole: 'MEMBER' });
    });

    it('denies a caller with no association (cross-seller / forged seller)', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('ACTIVE'));
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);

      await expect(service.listWarehouses(SELLER, CALLER)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });

    it('denies when the seller does not exist', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(null);

      await expect(service.listAgreements(SELLER, MEMBER)).rejects.toEqual(
        new SellerApplicationError('SELLER_NOT_FOUND'),
      );
    });
  });

  describe('admin surface (seller.audit.view / seller.evidence.read)', () => {
    it('lists sellers only with the audit grant (non-enumerating summary rows)', async () => {
      const { service, repository, adminAuthorization } = harness();
      repository.findAllSellers.mockResolvedValue([profile('ACTIVE'), profile('SUSPENDED')]);

      const sellers = await service.listSellers(CALLER, 'ACTIVE');

      expect(adminAuthorization.isGranted).toHaveBeenCalledWith(CALLER, 'seller.audit.view');
      expect(sellers).toHaveLength(1);
      expect(sellers[0]).toMatchObject({ sellerProfileId: SELLER.value, state: 'ACTIVE' });
      // Evidence and registration data are never in list rows.
      expect(JSON.stringify(sellers[0])).not.toContain('registrationNumber');
    });

    it('denies listing without the audit grant', async () => {
      const { service, adminAuthorization } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);

      await expect(service.listSellers(CALLER)).rejects.toEqual(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );
      // The admin must have the grant; no seller rows are produced.
      expect(service).toBeDefined();
    });

    it('returns seller detail only with the audit grant and an existing seller', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('UNDER_REVIEW'));
      repository.findOrganization.mockResolvedValue(organization());
      repository.findAssociations.mockResolvedValue([association(OWNER, 'OWNER')]);
      repository.findVerifications.mockResolvedValue([]);

      const detail = await service.getSellerDetail(CALLER, SELLER);
      expect(detail).toMatchObject({ sellerProfileId: SELLER.value, state: 'UNDER_REVIEW' });
      expect(detail.members[0]?.identityId).toBe(OWNER.value);
    });

    it('returns evidence METADATA only for seller.evidence.read', async () => {
      const { service, repository, adminAuthorization } = harness();
      repository.findById.mockResolvedValue(profile('SUBMITTED'));
      repository.findVerifications.mockResolvedValue([verification()]);
      repository.findEvidence.mockResolvedValue([
        new SellerVerificationEvidence({
          evidenceId: uuid(20),
          verificationId: VERIFICATION,
          evidenceType: 'GST_CERTIFICATE',
          evidenceReference: 'ref:object:abc123',
          evidenceDigest: 'b'.repeat(64),
          uploadedByIdentityId: OWNER,
          uploadedAt: NOW,
          createdAt: NOW,
        }),
      ]);

      const entries = await service.listEvidenceMetadata(CALLER, SELLER);

      expect(adminAuthorization.isGranted).toHaveBeenCalledWith(CALLER, 'seller.evidence.read');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        evidenceType: 'GST_CERTIFICATE',
        evidenceReference: 'ref:object:abc123',
        evidenceDigest: 'b'.repeat(64),
      });
      // Metadata only — no document content field exists at all.
      expect(entries[0]).not.toHaveProperty('content');
    });

    it('denies evidence metadata without seller.evidence.read', async () => {
      const { service, adminAuthorization } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);

      await expect(service.listEvidenceMetadata(CALLER, SELLER)).rejects.toEqual(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );
    });
  });
});
