import { AggregateVersion } from '../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AuthorizationDecisionEngine } from './authorization-decision-engine';
import { IdentityRoleAssignment } from './entities/identity-role-assignment';
import type { IdentityRoleAssignmentProperties } from './entities/identity-role-assignment';
import { Permission } from './entities/permission';
import { Role } from './entities/role';
import { PermissionCatalog } from './permission-catalog';
import { RoleCatalog } from './role-catalog';

const SUBJECT = new UuidV7('0191310f-789a-7123-8123-000000000001');
const ASSIGNMENT_A = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ASSIGNMENT_B = new UuidV7('0191310f-789a-7123-8123-000000000003');
const ASSIGNED_BY = new UuidV7('0191310f-789a-7123-8123-000000000004');
const NOW = new Date('2026-08-11T00:00:00.000Z');

function assignment(
  overrides: Partial<IdentityRoleAssignmentProperties> = {},
): IdentityRoleAssignment {
  return new IdentityRoleAssignment({
    assignmentId: ASSIGNMENT_A,
    identityId: SUBJECT,
    roleName: 'ADMIN',
    assignmentState: 'ACTIVE',
    assignedByIdentityId: ASSIGNED_BY,
    assignedAt: NOW,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function seededEngine(): AuthorizationDecisionEngine {
  return new AuthorizationDecisionEngine(new PermissionCatalog(), new RoleCatalog());
}

describe('AuthorizationDecisionEngine (M02 domain core)', () => {
  describe('deny by default (Part 6.1 §5)', () => {
    it('denies when the subject holds no role assignments', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [],
      );

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('NO_ACTIVE_ASSIGNMENT');
    });

    it('denies an unknown permission identifier even for an admin', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'orders.export' },
        [assignment()],
      );

      expect(decision.properties.denialReason).toBe('UNKNOWN_PERMISSION');
    });

    it('denies a retired permission (implicit permissions are prohibited)', () => {
      const catalog = new PermissionCatalog([
        new Permission({
          permissionId: 'legacy.operation',
          name: 'Legacy operation',
          protectedResource: 'legacy',
          allowedAction: 'MANAGE',
          status: 'RETIRED',
        }),
      ]);
      const engine = new AuthorizationDecisionEngine(catalog, new RoleCatalog());

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'legacy.operation' },
        [assignment()],
      );

      expect(decision.properties.denialReason).toBe('RETIRED_PERMISSION');
    });

    it('denies when no granted role covers the requested permission', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [assignment({ roleName: 'CUSTOMER' })],
      );

      expect(decision.properties.denialReason).toBe('PERMISSION_NOT_GRANTED');
    });

    it('denies when the only assignment is revoked', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [
          assignment({
            assignmentId: ASSIGNMENT_B,
            assignmentState: 'REVOKED',
            revokedByIdentityId: ASSIGNED_BY,
            revokedAt: NOW,
            aggregateVersion: new AggregateVersion(2),
          }),
        ],
      );

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('NO_ACTIVE_ASSIGNMENT');
    });

    it('denies when the granted role is suspended', () => {
      const suspendedAdmin = new Role({
        roleId: new UuidV7('0191310f-789a-7000-8000-000000000002'),
        roleName: 'ADMIN',
        state: 'SUSPENDED',
        grantedPermissionIds: ['recovery.approval.decide'],
        aggregateVersion: new AggregateVersion(2),
        createdAt: NOW,
        updatedAt: NOW,
      });
      const engine = new AuthorizationDecisionEngine(
        new PermissionCatalog(),
        new RoleCatalog([suspendedAdmin]),
      );

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [assignment()],
      );

      expect(decision.properties.denialReason).toBe('PERMISSION_NOT_GRANTED');
    });

    it('denies when the granted role is retired', () => {
      const retiredAdmin = new Role({
        roleId: new UuidV7('0191310f-789a-7000-8000-000000000002'),
        roleName: 'ADMIN',
        state: 'RETIRED',
        grantedPermissionIds: ['recovery.approval.decide'],
        aggregateVersion: new AggregateVersion(3),
        createdAt: NOW,
        updatedAt: NOW,
      });
      const engine = new AuthorizationDecisionEngine(
        new PermissionCatalog(),
        new RoleCatalog([retiredAdmin]),
      );

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [assignment()],
      );

      expect(decision.properties.denialReason).toBe('PERMISSION_NOT_GRANTED');
    });

    it('denies when the assignment references a role absent from the catalog', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [assignment({ roleName: 'SUPPORT_AGENT' as never })],
      );

      expect(decision.properties.denialReason).toBe('UNKNOWN_ROLE');
    });
  });

  describe('grants (Part 6.3 §15)', () => {
    it('grants when an ACTIVE assignment covers the requested permission', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [assignment()],
      );

      expect(decision.granted).toBe(true);
      expect(decision.properties.denialReason).toBeUndefined();
      expect(decision.properties.authorizationReference).toMatch(/^azr:[0-9a-f]{24}$/);
    });

    it('grants through one of several simultaneous role assignments', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [
          assignment({ assignmentId: ASSIGNMENT_A, roleName: 'CUSTOMER' }),
          assignment({ assignmentId: ASSIGNMENT_B, roleName: 'ADMIN' }),
        ],
      );

      expect(decision.granted).toBe(true);
    });

    it('grants Super Admin the privileged provisioning permission', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'identity.privileged.provision' },
        [assignment({ roleName: 'SUPER_ADMIN' })],
      );

      expect(decision.granted).toBe(true);
    });
  });

  describe('privilege escalation attempts are denied (Part 6.4 §16)', () => {
    it('denies a Customer requesting recovery approval', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [assignment({ roleName: 'CUSTOMER' })],
      );

      expect(decision.granted).toBe(false);
    });

    it('denies a Seller requesting role assignment', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'authorization.role.assign' },
        [assignment({ roleName: 'SELLER' })],
      );

      expect(decision.granted).toBe(false);
    });

    it('denies an Admin requesting privileged identity provisioning', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'identity.privileged.provision' },
        [assignment()],
      );

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('PERMISSION_NOT_GRANTED');
    });

    it('denies an Admin requesting Super Admin bootstrap', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'identity.superadmin.bootstrap' },
        [assignment()],
      );

      expect(decision.granted).toBe(false);
    });

    it('denies a CUSTOMER asking for an admin permission even alongside a valid role (no implicit inheritance)', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'identity.classification.change' },
        [assignment({ roleName: 'CUSTOMER' })],
      );

      expect(decision.granted).toBe(false);
    });
  });

  describe('explicit deny precedence (Part 6.4 §17)', () => {
    it('denies even when the role grants the permission', () => {
      const engine = seededEngine();

      const decision = engine.evaluate(
        {
          subjectIdentityId: SUBJECT,
          permissionId: 'recovery.approval.decide',
          explicitDenyPermissionIds: ['recovery.approval.decide'],
        },
        [assignment()],
      );

      expect(decision.granted).toBe(false);
      expect(decision.properties.denialReason).toBe('EXPLICITLY_DENIED');
    });
  });

  describe('determinism and decision invariants', () => {
    it('produces identical outcomes and references for identical inputs', () => {
      const engine = seededEngine();
      const assignments = [assignment()];
      const request = {
        subjectIdentityId: SUBJECT,
        permissionId: 'recovery.approval.decide',
      } as const;

      const first = engine.evaluate(request, assignments);
      const second = engine.evaluate(request, assignments);

      expect(second.properties).toEqual(first.properties);
    });

    it('produces different references for different subjects (audit correlation)', () => {
      const engine = seededEngine();
      const other = new UuidV7('0191310f-789a-7123-8123-000000000009');
      const assignments = [assignment()];

      const first = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        assignments,
      );
      const second = engine.evaluate(
        { subjectIdentityId: other, permissionId: 'recovery.approval.decide' },
        assignments,
      );

      expect(second.properties.authorizationReference).not.toBe(
        first.properties.authorizationReference,
      );
    });

    it('only GRANTED decisions are marked granted', () => {
      const engine = seededEngine();

      const denied = engine.evaluate(
        { subjectIdentityId: SUBJECT, permissionId: 'recovery.approval.decide' },
        [],
      );

      expect(denied.granted).toBe(false);
      expect(denied.properties.denialReason).toBeDefined();
    });
  });
});
