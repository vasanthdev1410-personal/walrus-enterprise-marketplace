/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerIdentityAssociation } from '../../domain/entities/seller-identity-association';
import { SellerProfile } from '../../domain/entities/seller-profile';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import type { Module01IdentityContractPort } from '../../domain/ports/module-01-contract.port';
import type { Module02AuthorizationContractPort } from '../../domain/ports/module-02-contract.port';
import { SellerLifecycle } from '../../domain/lifecycle/seller-lifecycle';
import { SellerAssociationPolicy } from '../../domain/policy/seller-association.policy';
import { SellerApplicationError } from '../errors/seller-application.error';
import type { SellerAdminAuthorizationPort } from '../ports/seller-admin-authorization.port';
import { SellerAuthorizationApplicationService } from './seller-authorization-application.service';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const ORG = new UuidV7('0191310f-789a-7123-8123-000000000002');
const OWNER = new UuidV7('0191310f-789a-7123-8123-000000000003');
const ADMIN = new UuidV7('0191310f-789a-7123-8123-000000000004');
const NOW = new Date('2026-08-13T00:00:00.000Z');

function uuid(seed: number): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${String(seed).padStart(12, '0')}`);
}

function profile(state: SellerProfile['properties']['state'], version: number): SellerProfile {
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

function ownerAssociation(): SellerIdentityAssociation {
  return new SellerIdentityAssociation({
    associationId: uuid(10),
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

interface Harness {
  service: SellerAuthorizationApplicationService;
  repository: jest.Mocked<SellerProfileRepository>;
  module01: jest.Mocked<Module01IdentityContractPort>;
  adminAuthorization: jest.Mocked<SellerAdminAuthorizationPort>;
  module02: jest.Mocked<Module02AuthorizationContractPort>;
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
  const module02 = {
    isSellerRoleGranted: jest.fn().mockResolvedValue(true),
    requestSellerRoleAssignment: jest.fn().mockResolvedValue({ outcome: 'GRANTED' }),
    revokeSellerRole: jest.fn().mockResolvedValue({ outcome: 'GRANTED' }),
  } as unknown as jest.Mocked<Module02AuthorizationContractPort>;
  let uuidCounter = 100;
  const service = new SellerAuthorizationApplicationService(
    repository,
    module01,
    new SellerLifecycle(),
    new SellerAssociationPolicy(),
    adminAuthorization,
    module02,
    { now: () => NOW },
    { next: () => uuid(uuidCounter++) },
  );
  return { service, repository, module01, adminAuthorization, module02 };
}

describe('SellerAuthorizationApplicationService (M03-M4, D-11 role assignment lifecycle)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('activateApprovedSeller (APPROVED → eligibility → role → ACTIVE)', () => {
    const command = { sellerProfileId: SELLER, expectedVersion: 4 };

    it('activates an APPROVED seller after the SELLER role assignment succeeds', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('APPROVED', 4));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);

      const result = await service.activateApprovedSeller(command);

      expect(result).toMatchObject({ state: 'ACTIVE', version: 5, sellerRoleGranted: true });
      expect(module02.requestSellerRoleAssignment).toHaveBeenCalledWith({
        targetIdentityId: OWNER,
        sellerProfileId: SELLER,
      });
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.sellerProfile.properties.state).toBe('ACTIVE');
      expect(changeSet?.transitionsToAppend[0]?.properties).toMatchObject({
        toState: 'ACTIVE',
        actorKind: 'SYSTEM',
      });
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('SELLER_ACTIVATED');
    });

    it('never activates without approval (SELLER_STATE_CONFLICT for pre-approval states)', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('SUBMITTED', 2));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);

      await expect(service.activateApprovedSeller({ sellerProfileId: SELLER, expectedVersion: 2 }))
        .rejects.toEqual(new SellerApplicationError('SELLER_STATE_CONFLICT'));
      expect(module02.requestSellerRoleAssignment).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('fails closed when the SELLER role assignment is denied (no partial access)', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('APPROVED', 4));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module02.requestSellerRoleAssignment.mockResolvedValue({
        outcome: 'DENIED',
        reason: 'SELLER_STATE_INELIGIBLE',
      });

      await expect(service.activateApprovedSeller(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ROLE_ASSIGNMENT_DENIED'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('fails closed when the SELLER role assignment fails', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('APPROVED', 4));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module02.requestSellerRoleAssignment.mockResolvedValue({
        outcome: 'FAILED',
        reason: 'ASSIGNMENT_FAILED',
      });

      await expect(service.activateApprovedSeller(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ROLE_ASSIGNMENT_DENIED'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('fails closed when the identity is not eligible (D-04)', async () => {
      const { service, repository, module01, module02 } = harness();
      repository.findById.mockResolvedValue(profile('APPROVED', 4));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module01.getIdentityEligibility.mockResolvedValue({
        identityId: OWNER,
        state: 'SUSPENDED',
        verificationState: 'VERIFIED',
      });

      await expect(service.activateApprovedSeller(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE'),
      );
      expect(module02.requestSellerRoleAssignment).not.toHaveBeenCalled();
    });

    it('rejects a stale version', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('APPROVED', 5));

      await expect(
        service.activateApprovedSeller({ sellerProfileId: SELLER, expectedVersion: 4 }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_STATE_CONFLICT'));
    });

    it('is idempotent for an already ACTIVE seller with the role (duplicate request)', async () => {
      const { service, repository, module02, adminAuthorization } = harness();
      repository.findById.mockResolvedValue(profile('ACTIVE', 5));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module02.isSellerRoleGranted.mockResolvedValue(true);

      const result = await service.activateApprovedSeller({
        sellerProfileId: SELLER,
        expectedVersion: 5,
      });

      expect(result).toMatchObject({ state: 'ACTIVE', sellerRoleGranted: true });
      expect(repository.save).not.toHaveBeenCalled();
      expect(module02.requestSellerRoleAssignment).not.toHaveBeenCalled();
      expect(adminAuthorization.isGranted).not.toHaveBeenCalled();
    });

    it('rejects an ACTIVE seller whose role was lost (no silent re-grant on duplicate request)', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('ACTIVE', 5));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module02.isSellerRoleGranted.mockResolvedValue(false);

      await expect(
        service.activateApprovedSeller({ sellerProfileId: SELLER, expectedVersion: 5 }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_STATE_CONFLICT'));
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('compensates by revoking the role when the ACTIVE transition cannot commit (no partial access)', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('APPROVED', 4));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      repository.save.mockRejectedValue(new Error('stale version'));

      await expect(service.activateApprovedSeller(command)).rejects.toThrow('stale version');
      expect(module02.revokeSellerRole).toHaveBeenCalledWith({
        identityId: OWNER,
        reasonReference: 'SELLER_ACTIVATION_ROLLED_BACK',
      });
      // The seller profile never reached ACTIVE.
      expect(repository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('suspendSeller (ACTIVE → SUSPENDED)', () => {
    const command = {
      sellerProfileId: SELLER,
      actorIdentityId: ADMIN,
      expectedVersion: 5,
      reasonReference: 'WEMP-SUSP-0001',
    };

    it('suspends an ACTIVE seller with a mandatory reason', async () => {
      const { service, repository, adminAuthorization } = harness();
      repository.findById.mockResolvedValue(profile('ACTIVE', 5));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);

      const result = await service.suspendSeller(command);

      expect(result).toMatchObject({ state: 'SUSPENDED', version: 6 });
      expect(adminAuthorization.isGranted).toHaveBeenCalledWith(ADMIN, 'seller.suspend.manage');
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.transitionsToAppend[0]?.properties).toMatchObject({
        toState: 'SUSPENDED',
        actorKind: 'ADMIN',
        reasonReference: 'WEMP-SUSP-0001',
      });
    });

    it('denies an admin without seller.suspend.manage', async () => {
      const { service, adminAuthorization, repository } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);

      await expect(service.suspendSeller(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects suspension without a reason reference', async () => {
      const { service, repository } = harness();

      await expect(
        service.suspendSeller({ ...command, reasonReference: '  ' }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_PRECONDITION_FAILED'));
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects suspension from a non-ACTIVE state and stale versions', async () => {
      const { service, repository } = harness();
      repository.findById.mockResolvedValue(profile('SUSPENDED', 6));

      await expect(
        service.suspendSeller({ ...command, expectedVersion: 6 }),
      ).rejects.toEqual(new SellerApplicationError('SELLER_STATE_CONFLICT'));
    });
  });

  describe('reactivateSeller (SUSPENDED → eligibility → role → ACTIVE)', () => {
    const command = { sellerProfileId: SELLER, actorIdentityId: ADMIN, expectedVersion: 6 };

    it('reactivates a SUSPENDED seller with the role idempotently ensured', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('SUSPENDED', 6));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module02.isSellerRoleGranted.mockResolvedValue(true);

      const result = await service.reactivateSeller(command);

      expect(result).toMatchObject({ state: 'ACTIVE', version: 7, sellerRoleGranted: true });
      // Role already granted → idempotent GRANTED without a new episode.
      expect(module02.requestSellerRoleAssignment).toHaveBeenCalledWith({
        targetIdentityId: OWNER,
        sellerProfileId: SELLER,
      });
    });

    it('fails closed when the identity is no longer eligible', async () => {
      const { service, repository, module01 } = harness();
      repository.findById.mockResolvedValue(profile('SUSPENDED', 6));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module01.getIdentityEligibility.mockResolvedValue({
        identityId: OWNER,
        state: 'LOCKED',
        verificationState: 'VERIFIED',
      });

      await expect(service.reactivateSeller(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_IDENTITY_INELIGIBLE'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('fails closed when role re-assignment is denied (stays suspended, no partial access)', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('SUSPENDED', 6));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module02.isSellerRoleGranted.mockResolvedValue(false);
      module02.requestSellerRoleAssignment.mockResolvedValue({
        outcome: 'DENIED',
        reason: 'SELLER_STATE_INELIGIBLE',
      });

      await expect(service.reactivateSeller(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ROLE_ASSIGNMENT_DENIED'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('denies an admin without seller.suspend.manage', async () => {
      const { service, adminAuthorization } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);

      await expect(service.reactivateSeller(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );
    });
  });

  describe('revokeSellerAuthorization (explicit revocation)', () => {
    const command = {
      sellerProfileId: SELLER,
      actorIdentityId: ADMIN,
      expectedVersion: 5,
      reasonReference: 'WEMP-REV-0001',
    };

    it('revokes the owner SELLER role with audit', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('ACTIVE', 5));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);

      const result = await service.revokeSellerAuthorization(command);

      expect(result).toMatchObject({ sellerRoleGranted: false, version: 6 });
      expect(module02.revokeSellerRole).toHaveBeenCalledWith({
        identityId: OWNER,
        revokedByIdentityId: ADMIN,
        reasonReference: 'WEMP-REV-0001',
      });
      const changeSet = repository.save.mock.calls[0]?.[0];
      expect(changeSet?.auditRecordsToAppend[0]?.properties.eventType).toBe('SELLER_ROLE_REVOKED');
    });

    it('denies an admin without seller.suspend.manage', async () => {
      const { service, adminAuthorization, module02 } = harness();
      adminAuthorization.isGranted.mockResolvedValue(false);

      await expect(service.revokeSellerAuthorization(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ADMIN_AUTHORIZATION_DENIED'),
      );
      expect(module02.revokeSellerRole).not.toHaveBeenCalled();
    });

    it('fails closed when the Module 02 revocation fails', async () => {
      const { service, repository, module02 } = harness();
      repository.findById.mockResolvedValue(profile('ACTIVE', 5));
      repository.findAssociations.mockResolvedValue([ownerAssociation()]);
      module02.revokeSellerRole.mockResolvedValue({ outcome: 'FAILED', reason: 'REVOCATION_FAILED' });

      await expect(service.revokeSellerAuthorization(command)).rejects.toEqual(
        new SellerApplicationError('SELLER_ROLE_REVOCATION_FAILED'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  it('never authorizes from a client-provided ownership claim (owner resolved server-side)', async () => {
    const { service, repository, module02 } = harness();
    repository.findById.mockResolvedValue(profile('APPROVED', 4));
    // Only the OWNER association exists; a forged identityId claim would fail.
    repository.findAssociations.mockResolvedValue([ownerAssociation()]);

    await service.activateApprovedSeller({ sellerProfileId: SELLER, expectedVersion: 4 });

    // The target identity used for the role assignment is the server-resolved
    // OWNER, never a caller-supplied identity.
    expect(module02.requestSellerRoleAssignment).toHaveBeenCalledWith({
      targetIdentityId: OWNER,
      sellerProfileId: SELLER,
    });
  });
});
