/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { OptimisticConcurrencyError } from '../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AuthorizationDecisionEngine } from '../../domain/authorization-decision-engine';
import { IdentityRoleAssignment } from '../../domain/entities/identity-role-assignment';
import { Role } from '../../domain/entities/role';
import type { AuthorizationDecisionRepository } from '../../domain/repositories/authorization-decision-repository';
import type { AuthorizationMutationPort } from '../ports/authorization-mutation.port';
import type { IdentityRoleAssignmentRepository } from '../../domain/repositories/identity-role-assignment-repository';
import { PermissionCatalog } from '../../domain/permission-catalog';
import { RoleCatalog } from '../../domain/role-catalog';
import type { SellerOwnershipResolverPort } from '../ports/seller-ownership-resolver.port';
import { AuthorizationApplicationService } from './authorization-application.service';

const ACTOR = new UuidV7('0191310f-789a-7123-8123-000000000001');
const TARGET = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ASSIGNMENT_ID = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NEW_ASSIGNMENT_ID = new UuidV7('0191310f-789a-7123-8123-000000000004');
const SELLER_PROFILE_ID = new UuidV7('0191310f-789a-7123-8123-000000000005');
const ORGANIZATION_ID = new UuidV7('0191310f-789a-7123-8123-000000000006');
const NOW = new Date('2026-08-11T00:00:00.000Z');

function assignment(
  overrides: Partial<IdentityRoleAssignment['properties']> = {},
): IdentityRoleAssignment {
  return new IdentityRoleAssignment({
    assignmentId: ASSIGNMENT_ID,
    identityId: TARGET,
    roleName: 'ADMIN',
    assignmentState: 'ACTIVE',
    assignedByIdentityId: ACTOR,
    assignedAt: NOW,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

interface AuthorizationFixture {
  readonly service: AuthorizationApplicationService;
  readonly findById: jest.Mock<Promise<unknown>, [unknown]>;
  readonly findByIdentityId: jest.Mock<Promise<readonly unknown[]>, [unknown]>;
  readonly findActiveByIdentityId: jest.Mock<Promise<readonly unknown[]>, [unknown]>;
  readonly insert: jest.Mock<Promise<unknown>, [unknown]>;
  readonly save: jest.Mock<Promise<unknown>, [unknown]>;
  readonly recordInsert: jest.Mock<Promise<unknown>, [unknown]>;
  readonly assignRoleWithAudit: jest.Mock<Promise<void>, [unknown, unknown]>;
  readonly revokeRoleWithAudit: jest.Mock<Promise<void>, [unknown, unknown]>;
}

function createFixture(
  roles?: RoleCatalog,
  identifiers: { next: () => UuidV7 } = { next: () => NEW_ASSIGNMENT_ID },
  resolver?: SellerOwnershipResolverPort,
): AuthorizationFixture {
  const findById = jest.fn<Promise<unknown>, [unknown]>();
  const findByIdentityId = jest.fn<Promise<readonly unknown[]>, [unknown]>();
  const findActiveByIdentityId = jest.fn<Promise<readonly unknown[]>, [unknown]>();
  const insert = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
  const save = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
  const recordInsert = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
  const assignRoleWithAudit = jest
    .fn<Promise<void>, [unknown, unknown]>()
    .mockResolvedValue(undefined);
  const revokeRoleWithAudit = jest
    .fn<Promise<void>, [unknown, unknown]>()
    .mockResolvedValue(undefined);
  const assignments = {
    findById,
    findByIdentityId,
    findActiveByIdentityId,
    insert,
    save,
  } as unknown as jest.Mocked<IdentityRoleAssignmentRepository>;
  const decisions = {
    insert: recordInsert,
  } as unknown as jest.Mocked<AuthorizationDecisionRepository>;
  const mutations = {
    assignRoleWithAudit,
    revokeRoleWithAudit,
  } as unknown as jest.Mocked<AuthorizationMutationPort>;
  const roleCatalog = roles ?? new RoleCatalog();
  const service = new AuthorizationApplicationService(
    new AuthorizationDecisionEngine(new PermissionCatalog(), roleCatalog),
    roleCatalog,
    assignments,
    decisions,
    mutations,
    { now: () => NOW },
    identifiers,
    { isEligible: jest.fn().mockResolvedValue(true) },
    resolver,
  );
  return {
    service,
    findById,
    findByIdentityId,
    findActiveByIdentityId,
    insert,
    save,
    recordInsert,
    assignRoleWithAudit,
    revokeRoleWithAudit,
  };
}

function scope(
  overrides: Partial<{
    sellerProfileId: UuidV7;
    organizationId: UuidV7;
    sellerState: string;
    associationRole: 'OWNER' | 'MEMBER';
    associationState: 'ACTIVE' | 'REMOVED';
  }> = {},
): never {
  return {
    sellerProfileId: SELLER_PROFILE_ID,
    organizationId: ORGANIZATION_ID,
    sellerState: 'ACTIVE',
    associationRole: 'OWNER',
    associationState: 'ACTIVE',
    ...overrides,
  } as never;
}

function sellerAssignment(
  overrides: Partial<IdentityRoleAssignment['properties']> = {},
): IdentityRoleAssignment {
  return new IdentityRoleAssignment({
    assignmentId: ASSIGNMENT_ID,
    identityId: TARGET,
    roleName: 'SELLER',
    assignmentState: 'ACTIVE',
    assignmentOriginType: 'SELLER_LIFECYCLE',
    assignedByWorkloadIdentity: 'walrus.module-03.seller-lifecycle',
    authorityEvidenceReference: 'seller:test',
    operationId: SELLER_PROFILE_ID,
    assignedAt: NOW,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

describe('AuthorizationApplicationService (M02)', () => {
  describe('authorize', () => {
    it('grants and records the decision when an ACTIVE role covers the permission', async () => {
      const { service, findActiveByIdentityId, recordInsert } = createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'ADMIN' })]);

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'recovery.approval.decide',
        sessionIdentifier: 'sess-1',
      });

      expect(decision.granted).toBe(true);
      expect(recordInsert).toHaveBeenCalledTimes(1);
      const record = (recordInsert.mock.calls[0]?.[0] as { properties: Record<string, unknown> })
        .properties;
      expect(record).toMatchObject({
        permissionId: 'recovery.approval.decide',
        decisionOutcome: 'GRANTED',
        sessionIdentifier: 'sess-1',
      });
      expect(record.denialReason).toBeUndefined();
    });

    it('denies and records the denial when the subject has no covering role', async () => {
      const { service, findActiveByIdentityId, recordInsert } = createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'CUSTOMER' })]);

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'recovery.approval.decide',
      });

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('PERMISSION_NOT_GRANTED');
      const record = (recordInsert.mock.calls[0]?.[0] as { properties: Record<string, unknown> })
        .properties;
      expect(record).toMatchObject({
        decisionOutcome: 'DENIED',
        denialReason: 'PERMISSION_NOT_GRANTED',
      });
    });

    it('creates independent traceable records for repeated identical checks', async () => {
      const decisionIds = [
        new UuidV7('0191310f-789a-7123-8123-000000000010'),
        new UuidV7('0191310f-789a-7123-8123-000000000011'),
      ];
      let decisionIndex = 0;
      const { service, findActiveByIdentityId, recordInsert } = createFixture(undefined, {
        next: () => {
          const identifier = decisionIds[decisionIndex++];
          if (identifier === undefined) {
            throw new Error('Test decision identifier sequence exhausted');
          }
          return identifier;
        },
      });
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'ADMIN' })]);

      const first = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'recovery.approval.decide',
      });
      const second = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'recovery.approval.decide',
      });

      expect(first.granted).toBe(true);
      expect(second.granted).toBe(true);
      expect(first.properties.authorizationReference).not.toBe(
        second.properties.authorizationReference,
      );
      expect(recordInsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('assignRole (Part 6.2 §9, §7 administrative scope)', () => {
    it('denies direct SUPER_ADMIN assignment because M4 controlled provisioning owns it', async () => {
      const { service, findActiveByIdentityId, findByIdentityId, assignRoleWithAudit } =
        createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'SUPER_ADMIN' })]);
      findByIdentityId.mockResolvedValue([]);

      await expect(
        service.assignRole({
          targetIdentityId: TARGET,
          roleName: 'SUPER_ADMIN',
          assignedByIdentityId: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE' });
      expect(assignRoleWithAudit).not.toHaveBeenCalled();
    });

    it('lets an ADMIN assign a CUSTOMER role within administrative scope', async () => {
      const { service, findActiveByIdentityId, findByIdentityId, assignRoleWithAudit } =
        createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'ADMIN' })]);
      findByIdentityId.mockResolvedValue([]);

      const result = await service.assignRole({
        targetIdentityId: TARGET,
        roleName: 'CUSTOMER',
        assignedByIdentityId: ACTOR,
      });

      expect(result.properties.roleName).toBe('CUSTOMER');
      expect(assignRoleWithAudit).toHaveBeenCalledTimes(1);
    });

    it('creates a new assignment episode when the prior episode is revoked', async () => {
      const { service, findActiveByIdentityId, findByIdentityId, assignRoleWithAudit } =
        createFixture();
      const historical = assignment({
        roleName: 'CUSTOMER',
        assignmentState: 'REVOKED',
        revokedByIdentityId: ACTOR,
        revokedAt: NOW,
        aggregateVersion: new AggregateVersion(2),
      });
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'SUPER_ADMIN' })]);
      findByIdentityId.mockResolvedValue([historical]);

      const result = await service.assignRole({
        targetIdentityId: TARGET,
        roleName: 'CUSTOMER',
        assignedByIdentityId: ACTOR,
      });

      expect(result.properties.assignmentId).toBe(NEW_ASSIGNMENT_ID);
      expect(result.properties.assignmentId).not.toBe(historical.properties.assignmentId);
      expect(result.properties.assignmentState).toBe('ACTIVE');
      expect(historical.properties.assignmentState).toBe('REVOKED');
      expect(assignRoleWithAudit).toHaveBeenCalledTimes(1);
    });

    it('denies an ADMIN assigning the SUPER_ADMIN role (privilege escalation)', async () => {
      const { service, findActiveByIdentityId, assignRoleWithAudit } = createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'ADMIN' })]);

      await expect(
        service.assignRole({
          targetIdentityId: TARGET,
          roleName: 'SUPER_ADMIN',
          assignedByIdentityId: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE' });
      expect(assignRoleWithAudit).not.toHaveBeenCalled();
    });

    it('denies an ADMIN assigning the ADMIN role (no self-scope below the top role)', async () => {
      const { service, findActiveByIdentityId } = createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'ADMIN' })]);

      await expect(
        service.assignRole({
          targetIdentityId: TARGET,
          roleName: 'ADMIN',
          assignedByIdentityId: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE' });
    });

    it('denies a SELLER assigning an ADMIN role', async () => {
      const { service, findActiveByIdentityId } = createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'SELLER' })]);

      await expect(
        service.assignRole({
          targetIdentityId: TARGET,
          roleName: 'ADMIN',
          assignedByIdentityId: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE' });
    });

    it('rejects an unknown role', async () => {
      const { service, findActiveByIdentityId } = createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'SUPER_ADMIN' })]);

      await expect(
        service.assignRole({
          targetIdentityId: TARGET,
          roleName: 'SUPPORT_AGENT' as never,
          assignedByIdentityId: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'ROLE_UNKNOWN' });
    });

    it('rejects assigning a RETIRED role (Part 6.2 §10)', async () => {
      const retired = new Role({
        roleId: new UuidV7('0191310f-789a-7000-8000-000000000002'),
        roleName: 'ADMIN',
        state: 'RETIRED',
        grantedPermissionIds: [],
        aggregateVersion: new AggregateVersion(3),
        createdAt: NOW,
        updatedAt: NOW,
      });
      const { service, findActiveByIdentityId } = createFixture(new RoleCatalog([retired]));
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'SUPER_ADMIN' })]);

      await expect(
        service.assignRole({
          targetIdentityId: TARGET,
          roleName: 'ADMIN',
          assignedByIdentityId: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'ROLE_RETIRED' });
    });

    it('rejects a duplicate ACTIVE assignment for the requested role', async () => {
      const { service, findActiveByIdentityId, findByIdentityId } = createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'ADMIN' })]);
      findByIdentityId.mockResolvedValue([assignment({ roleName: 'CUSTOMER' })]);

      await expect(
        service.assignRole({
          targetIdentityId: TARGET,
          roleName: 'CUSTOMER',
          assignedByIdentityId: ACTOR,
        }),
      ).rejects.toMatchObject({ code: 'ALREADY_ASSIGNED' });
    });
  });

  describe('revokeRole (version-checked)', () => {
    it('revokes an ACTIVE assignment and records the event', async () => {
      const { service, findById, findActiveByIdentityId, revokeRoleWithAudit } = createFixture();
      findById.mockResolvedValue(assignment());
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'SUPER_ADMIN' })]);

      const result = await service.revokeRole({
        assignmentId: ASSIGNMENT_ID,
        revokedByIdentityId: ACTOR,
      });

      expect(result.properties.assignmentState).toBe('REVOKED');
      expect(result.properties.revokedAt).toEqual(NOW);
      expect(revokeRoleWithAudit).toHaveBeenCalledTimes(1);
      const saved = revokeRoleWithAudit.mock.calls[0]?.[0] as
        { properties?: Record<string, unknown> } | undefined;
      expect(saved?.properties).toMatchObject({
        assignmentState: 'REVOKED',
        aggregateVersion: { value: 2 },
      });
      const audit = revokeRoleWithAudit.mock.calls[0]?.[1] as
        { properties?: Record<string, unknown> } | undefined;
      expect(audit?.properties).toMatchObject({
        actorIdentityId: ACTOR,
        subjectIdentityId: TARGET,
      });
    });

    it('fails with ASSIGNMENT_NOT_FOUND when the assignment does not exist', async () => {
      const { service, findById } = createFixture();
      findById.mockResolvedValue(null);

      await expect(
        service.revokeRole({ assignmentId: ASSIGNMENT_ID, revokedByIdentityId: ACTOR }),
      ).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
    });

    it('fails with ALREADY_REVOKED for a revoked assignment', async () => {
      const { service, findById } = createFixture();
      findById.mockResolvedValue(
        assignment({
          assignmentState: 'REVOKED',
          revokedByIdentityId: ACTOR,
          revokedAt: NOW,
          aggregateVersion: new AggregateVersion(2),
        }),
      );

      await expect(
        service.revokeRole({ assignmentId: ASSIGNMENT_ID, revokedByIdentityId: ACTOR }),
      ).rejects.toMatchObject({ code: 'ALREADY_REVOKED' });
    });

    it('denies a lower-scope actor revoking a higher-scope assignment', async () => {
      const { service, findById, findActiveByIdentityId, revokeRoleWithAudit } = createFixture();
      findById.mockResolvedValue(assignment({ roleName: 'SUPER_ADMIN' }));
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'ADMIN' })]);

      await expect(
        service.revokeRole({ assignmentId: ASSIGNMENT_ID, revokedByIdentityId: ACTOR }),
      ).rejects.toMatchObject({ code: 'TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE' });
      expect(revokeRoleWithAudit).not.toHaveBeenCalled();
    });

    it('denies same-role revocation without an explicitly approved same-role rule', async () => {
      const { service, findById, findActiveByIdentityId, revokeRoleWithAudit } = createFixture();
      findById.mockResolvedValue(assignment({ roleName: 'ADMIN' }));
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'ADMIN' })]);

      await expect(
        service.revokeRole({ assignmentId: ASSIGNMENT_ID, revokedByIdentityId: ACTOR }),
      ).rejects.toMatchObject({ code: 'TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE' });
      expect(revokeRoleWithAudit).not.toHaveBeenCalled();
    });

    it('maps a stale-version conflict to STALE_VERSION', async () => {
      const { service, findById, findActiveByIdentityId, revokeRoleWithAudit } = createFixture();
      findById.mockResolvedValue(assignment());
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'SUPER_ADMIN' })]);
      revokeRoleWithAudit.mockRejectedValue(
        new OptimisticConcurrencyError('IdentityRoleAssignment'),
      );

      await expect(
        service.revokeRole({ assignmentId: ASSIGNMENT_ID, revokedByIdentityId: ACTOR }),
      ).rejects.toMatchObject({ code: 'STALE_VERSION' });
    });
  });

  describe('authorize — organization scope (WEMP-M03-AUTHZ-001 §4, D-11)', () => {
    const resolver: jest.Mocked<SellerOwnershipResolverPort> = {
      resolveSellerScope: jest.fn(),
    };

    it('grants an org-scoped seller permission when the SELLER role and ACTIVE association scope both pass', async () => {
      const { service, findActiveByIdentityId, recordInsert } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);
      resolver.resolveSellerScope.mockResolvedValue(scope());

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'seller.profile.read',
        resourceReference: SELLER_PROFILE_ID,
      });

      expect(decision.granted).toBe(true);
      const record = (recordInsert.mock.calls[0]?.[0] as { properties: Record<string, unknown> })
        .properties;
      expect(record).toMatchObject({
        permissionId: 'seller.profile.read',
        decisionOutcome: 'GRANTED',
        resourceType: 'seller.profile',
        resourceReference: SELLER_PROFILE_ID.value,
      });
    });

    it('denies a SELLER accessing another seller (SCOPE_NOT_ASSOCIATED)', async () => {
      const { service, findActiveByIdentityId, recordInsert } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);
      resolver.resolveSellerScope.mockResolvedValue(null);

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'seller.profile.read',
        resourceReference: new UuidV7('0191310f-789a-7123-8123-0000000000ab'),
      });

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('SCOPE_NOT_ASSOCIATED');
      const record = (recordInsert.mock.calls[0]?.[0] as { properties: Record<string, unknown> })
        .properties;
      expect(record).toMatchObject({
        decisionOutcome: 'DENIED',
        denialReason: 'SCOPE_NOT_ASSOCIATED',
        resourceReference: '0191310f-789a-7123-8123-0000000000ab',
      });
      // The engine must never run with a forged seller reference.
      expect(record.decisionOutcome).toBe('DENIED');
    });

    it('denies a forged/missing resource reference (SCOPE_RESOURCE_MISSING)', async () => {
      const { service, findActiveByIdentityId } = createFixture(undefined, undefined, resolver);
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'seller.profile.read',
      });

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('SCOPE_RESOURCE_MISSING');
    });

    it('fails closed when the ownership resolver is unavailable (SCOPE_RESOLUTION_UNAVAILABLE)', async () => {
      const { service, findActiveByIdentityId } = createFixture();
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'seller.profile.read',
        resourceReference: SELLER_PROFILE_ID,
      });

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('SCOPE_RESOLUTION_UNAVAILABLE');
    });

    it('denies when the seller is terminal (SCOPE_SELLER_TERMINAL)', async () => {
      const { service, findActiveByIdentityId } = createFixture(undefined, undefined, resolver);
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);
      resolver.resolveSellerScope.mockResolvedValue(scope({ sellerState: 'CLOSED' }));

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'seller.profile.read',
        resourceReference: SELLER_PROFILE_ID,
      });

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('SCOPE_SELLER_TERMINAL');
    });

    it('denies when the resolver fails (SCOPE_RESOLUTION_UNAVAILABLE, fail closed)', async () => {
      const { service, findActiveByIdentityId } = createFixture(undefined, undefined, resolver);
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);
      resolver.resolveSellerScope.mockRejectedValue(new Error('storage down'));

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'seller.profile.read',
        resourceReference: SELLER_PROFILE_ID,
      });

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('SCOPE_RESOLUTION_UNAVAILABLE');
    });

    it('grants org-scoped permissions when the SELLER role covers them and scope passes', async () => {
      const { service, findActiveByIdentityId } = createFixture(undefined, undefined, resolver);
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);
      resolver.resolveSellerScope.mockResolvedValue(scope());

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'seller.profile.close',
        resourceReference: SELLER_PROFILE_ID,
      });

      expect(decision.granted).toBe(true);
    });

    it('denies an org-scoped permission when the role does not cover it even with valid scope', async () => {
      const { service, findActiveByIdentityId } = createFixture(undefined, undefined, resolver);
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'CUSTOMER' })]);
      resolver.resolveSellerScope.mockResolvedValue(scope());

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'seller.profile.read',
        resourceReference: SELLER_PROFILE_ID,
      });

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('PERMISSION_NOT_GRANTED');
    });

    it('does not apply the org-scope gate to administrative seller permissions', async () => {
      const { service, findActiveByIdentityId } = createFixture(undefined, undefined, resolver);
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'ADMIN' })]);
      // No resourceReference supplied and the resolver is never consulted.

      const decision = await service.authorize({
        subjectIdentityId: TARGET,
        permissionId: 'seller.review.decide',
      });

      expect(decision.granted).toBe(true);
      expect(resolver.resolveSellerScope).not.toHaveBeenCalled();
    });
  });

  describe('assignSellerRoleForActivation (D-11, APPROVED → role → ACTIVE gate)', () => {
    const resolver: jest.Mocked<SellerOwnershipResolverPort> = {
      resolveSellerScope: jest.fn(),
    };

    it('grants the SELLER role for an APPROVED seller with an ACTIVE association', async () => {
      const { service, findActiveByIdentityId, assignRoleWithAudit } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([]);
      resolver.resolveSellerScope.mockResolvedValue(scope({ sellerState: 'APPROVED' }));

      const result = await service.assignSellerRoleForActivation({
        targetIdentityId: TARGET,
        sellerProfileId: SELLER_PROFILE_ID,
        authorityEvidenceReference: 'seller:test',
      });

      expect(result).toEqual({ outcome: 'GRANTED' });
      expect(assignRoleWithAudit).toHaveBeenCalledTimes(1);
      const saved = assignRoleWithAudit.mock.calls[0]?.[0] as
        { properties?: Record<string, unknown> } | undefined;
      expect(saved?.properties).toMatchObject({
        roleName: 'SELLER',
        assignmentState: 'ACTIVE',
        assignmentOriginType: 'SELLER_LIFECYCLE',
        assignedByWorkloadIdentity: 'walrus.module-03.seller-lifecycle',
        operationId: SELLER_PROFILE_ID,
      });
      const audit = assignRoleWithAudit.mock.calls[0]?.[1] as
        { properties?: Record<string, unknown> } | undefined;
      expect(audit?.properties).toMatchObject({
        permissionId: 'authorization.role.assign',
        subjectIdentityId: TARGET,
        decisionOutcome: 'GRANTED',
        workloadIdentity: 'walrus.module-03.seller-lifecycle',
      });
    });

    it('denies assignment for a seller that was never approved (SELLER_STATE_INELIGIBLE)', async () => {
      const { service, findActiveByIdentityId, assignRoleWithAudit } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([]);
      resolver.resolveSellerScope.mockResolvedValue(scope({ sellerState: 'DRAFT' }));

      const result = await service.assignSellerRoleForActivation({
        targetIdentityId: TARGET,
        sellerProfileId: SELLER_PROFILE_ID,
        authorityEvidenceReference: 'seller:test',
      });

      expect(result).toMatchObject({ outcome: 'DENIED', reason: 'SELLER_STATE_INELIGIBLE' });
      expect(assignRoleWithAudit).not.toHaveBeenCalled();
    });

    it('denies assignment for a terminal seller', async () => {
      const { service, findActiveByIdentityId } = createFixture(undefined, undefined, resolver);
      findActiveByIdentityId.mockResolvedValue([]);
      resolver.resolveSellerScope.mockResolvedValue(scope({ sellerState: 'REJECTED' }));

      const result = await service.assignSellerRoleForActivation({
        targetIdentityId: TARGET,
        sellerProfileId: SELLER_PROFILE_ID,
        authorityEvidenceReference: 'seller:test',
      });

      expect(result).toMatchObject({ outcome: 'DENIED', reason: 'SELLER_STATE_INELIGIBLE' });
    });

    it('denies assignment when the identity has no ACTIVE association to the seller', async () => {
      const { service, findActiveByIdentityId } = createFixture(undefined, undefined, resolver);
      findActiveByIdentityId.mockResolvedValue([]);
      resolver.resolveSellerScope.mockResolvedValue(null);

      const result = await service.assignSellerRoleForActivation({
        targetIdentityId: TARGET,
        sellerProfileId: SELLER_PROFILE_ID,
        authorityEvidenceReference: 'seller:test',
      });

      expect(result).toMatchObject({ outcome: 'DENIED', reason: 'SELLER_NOT_ASSOCIATED' });
    });

    it('fails closed when the resolver is unavailable', async () => {
      const { service, findActiveByIdentityId, assignRoleWithAudit } = createFixture();
      findActiveByIdentityId.mockResolvedValue([]);

      const result = await service.assignSellerRoleForActivation({
        targetIdentityId: TARGET,
        sellerProfileId: SELLER_PROFILE_ID,
        authorityEvidenceReference: 'seller:test',
      });

      expect(result).toMatchObject({ outcome: 'FAILED', reason: 'SCOPE_RESOLUTION_UNAVAILABLE' });
      expect(assignRoleWithAudit).not.toHaveBeenCalled();
    });

    it('is idempotent: an existing ACTIVE SELLER assignment resolves to GRANTED', async () => {
      const { service, findActiveByIdentityId, assignRoleWithAudit } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);
      resolver.resolveSellerScope.mockResolvedValue(scope({ sellerState: 'APPROVED' }));

      const result = await service.assignSellerRoleForActivation({
        targetIdentityId: TARGET,
        sellerProfileId: SELLER_PROFILE_ID,
        authorityEvidenceReference: 'seller:test',
      });

      expect(result).toEqual({ outcome: 'GRANTED' });
      expect(assignRoleWithAudit).not.toHaveBeenCalled();
    });

    it('fails with STALE_VERSION on an optimistic-concurrency conflict (concurrent activation)', async () => {
      const { service, findActiveByIdentityId, assignRoleWithAudit } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([]);
      resolver.resolveSellerScope.mockResolvedValue(scope({ sellerState: 'APPROVED' }));
      assignRoleWithAudit.mockRejectedValue(
        new OptimisticConcurrencyError('IdentityRoleAssignment'),
      );

      const result = await service.assignSellerRoleForActivation({
        targetIdentityId: TARGET,
        sellerProfileId: SELLER_PROFILE_ID,
        authorityEvidenceReference: 'seller:test',
      });

      expect(result).toMatchObject({ outcome: 'FAILED', reason: 'STALE_VERSION' });
    });
  });

  describe('revokeSellerRole (D-11)', () => {
    const resolver: jest.Mocked<SellerOwnershipResolverPort> = {
      resolveSellerScope: jest.fn(),
    };

    it('revokes every ACTIVE SELLER assignment with audit provenance', async () => {
      const { service, findActiveByIdentityId, revokeRoleWithAudit } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);

      const result = await service.revokeSellerRole({
        identityId: TARGET,
        revokedByIdentityId: ACTOR,
        reasonReference: 'seller.closed',
      });

      expect(result).toEqual({ outcome: 'GRANTED' });
      expect(revokeRoleWithAudit).toHaveBeenCalledTimes(1);
      const saved = revokeRoleWithAudit.mock.calls[0]?.[0] as
        { properties?: Record<string, unknown> } | undefined;
      expect(saved?.properties).toMatchObject({
        assignmentState: 'REVOKED',
        revokedByIdentityId: ACTOR,
        revocationReasonReference: 'seller.closed',
        aggregateVersion: { value: 2 },
      });
      const audit = revokeRoleWithAudit.mock.calls[0]?.[1] as
        { properties?: Record<string, unknown> } | undefined;
      expect(audit?.properties).toMatchObject({
        permissionId: 'authorization.role.revoke',
        decisionOutcome: 'GRANTED',
        actorIdentityId: ACTOR,
      });
    });

    it('revokes a control-plane assignment without a human revoker (compensation)', async () => {
      const { service, findActiveByIdentityId, revokeRoleWithAudit } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);

      const result = await service.revokeSellerRole({
        identityId: TARGET,
        reasonReference: 'SELLER_ACTIVATION_ROLLED_BACK',
      });

      expect(result).toEqual({ outcome: 'GRANTED' });
      const saved = revokeRoleWithAudit.mock.calls[0]?.[0] as
        { properties?: Record<string, unknown> } | undefined;
      expect(saved?.properties).toMatchObject({ assignmentState: 'REVOKED' });
      const audit = revokeRoleWithAudit.mock.calls[0]?.[1] as
        { properties?: Record<string, unknown> } | undefined;
      expect(audit?.properties).toMatchObject({
        workloadIdentity: 'walrus.module-03.seller-lifecycle',
      });
    });

    it('is idempotent when there is nothing to revoke', async () => {
      const { service, findActiveByIdentityId, revokeRoleWithAudit } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'CUSTOMER' })]);

      const result = await service.revokeSellerRole({ identityId: TARGET });

      expect(result).toEqual({ outcome: 'GRANTED' });
      expect(revokeRoleWithAudit).not.toHaveBeenCalled();
    });

    it('fails with STALE_VERSION on a concurrent revocation conflict', async () => {
      const { service, findActiveByIdentityId, revokeRoleWithAudit } = createFixture(
        undefined,
        undefined,
        resolver,
      );
      findActiveByIdentityId.mockResolvedValue([sellerAssignment()]);
      revokeRoleWithAudit.mockRejectedValue(
        new OptimisticConcurrencyError('IdentityRoleAssignment'),
      );

      const result = await service.revokeSellerRole({ identityId: TARGET });

      expect(result).toMatchObject({ outcome: 'FAILED', reason: 'STALE_VERSION' });
    });
  });

  it('exposes the role catalog for authorized reads', () => {
    const { service } = createFixture();

    const roles = service.listRoleCatalog();

    expect(roles.map((role) => role.properties.roleName).sort()).toEqual([
      'ADMIN',
      'CUSTOMER',
      'SELLER',
      'SUPER_ADMIN',
    ]);
  });
});
