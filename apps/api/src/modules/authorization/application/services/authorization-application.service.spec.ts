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
import { AuthorizationApplicationService } from './authorization-application.service';

const ACTOR = new UuidV7('0191310f-789a-7123-8123-000000000001');
const TARGET = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ASSIGNMENT_ID = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NEW_ASSIGNMENT_ID = new UuidV7('0191310f-789a-7123-8123-000000000004');
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
    it('lets a SUPER_ADMIN assign the SUPER_ADMIN role', async () => {
      const { service, findActiveByIdentityId, findByIdentityId, assignRoleWithAudit } =
        createFixture();
      findActiveByIdentityId.mockResolvedValue([assignment({ roleName: 'SUPER_ADMIN' })]);
      findByIdentityId.mockResolvedValue([]);

      const result = await service.assignRole({
        targetIdentityId: TARGET,
        roleName: 'SUPER_ADMIN',
        assignedByIdentityId: ACTOR,
      });

      expect(result.properties.roleName).toBe('SUPER_ADMIN');
      expect(assignRoleWithAudit).toHaveBeenCalledTimes(1);
      const audit = assignRoleWithAudit.mock.calls[0]?.[1] as
        { properties?: Record<string, unknown> } | undefined;
      expect(audit?.properties).toMatchObject({
        actorIdentityId: ACTOR,
        subjectIdentityId: TARGET,
      });
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
