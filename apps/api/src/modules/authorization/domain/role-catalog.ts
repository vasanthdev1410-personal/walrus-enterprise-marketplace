import { AggregateVersion } from '../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Role } from './entities/role';
import { RoleHierarchy } from './role-hierarchy';
import type { RoleName } from './value-objects/role-name';

/**
 * Part 6.2 §6–10 (Module 02 source material). The centrally managed Phase-1
 * role catalog. Roles are immutable, versioned configuration with an explicit
 * granted-permission set (Part 6.2 §9: permissions are assigned to roles only,
 * never directly to identities in Phase 1). The role → permission matrix is
 * the proposed Phase-1 policy documented in docs/module-02/implementation-spec.md
 * §4 and must be confirmed at Module 02 approval. The UuidV7/AggregateVersion
 * primitives are shared platform value objects reused from the
 * identity-authentication module (type reuse only — no Module 01 storage is
 * ever read).
 */
const ROLE_IDS: Readonly<Record<RoleName, string>> = {
  SUPER_ADMIN: '0191310f-789a-7000-8000-000000000001',
  ADMIN: '0191310f-789a-7000-8000-000000000002',
  SELLER: '0191310f-789a-7000-8000-000000000003',
  CUSTOMER: '0191310f-789a-7000-8000-000000000004',
};

const SEEDED_AT = new Date('2026-08-11T00:00:00.000Z');

const SUPER_ADMIN_PERMISSIONS = [
  'recovery.approval.decide',
  'identity.state.change',
  'identity.classification.change',
  'identity.privileged.provision',
  'identity.superadmin.bootstrap',
  'authorization.role.assign',
  'authorization.role.revoke',
  'authorization.permission.view',
] as const;

const ADMIN_PERMISSIONS = [
  'recovery.approval.decide',
  'identity.state.change',
  'identity.classification.change',
  'authorization.role.assign',
  'authorization.role.revoke',
  'authorization.permission.view',
] as const;

const SEEDED_ROLES: readonly Role[] = Object.freeze([
  new Role({
    roleId: new UuidV7(ROLE_IDS.SUPER_ADMIN),
    roleName: 'SUPER_ADMIN',
    state: 'ACTIVE',
    grantedPermissionIds: [...SUPER_ADMIN_PERMISSIONS],
    aggregateVersion: new AggregateVersion(1),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  }),
  new Role({
    roleId: new UuidV7(ROLE_IDS.ADMIN),
    roleName: 'ADMIN',
    state: 'ACTIVE',
    grantedPermissionIds: [...ADMIN_PERMISSIONS],
    aggregateVersion: new AggregateVersion(1),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  }),
  new Role({
    roleId: new UuidV7(ROLE_IDS.SELLER),
    roleName: 'SELLER',
    state: 'ACTIVE',
    grantedPermissionIds: [],
    aggregateVersion: new AggregateVersion(1),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  }),
  new Role({
    roleId: new UuidV7(ROLE_IDS.CUSTOMER),
    roleName: 'CUSTOMER',
    state: 'ACTIVE',
    grantedPermissionIds: [],
    aggregateVersion: new AggregateVersion(1),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  }),
]);

export class RoleCatalog {
  private readonly rolesByRoleName: ReadonlyMap<RoleName, Role>;
  private readonly allRoles: readonly Role[];
  private readonly roleHierarchy: RoleHierarchy;

  public constructor(roles: readonly Role[] = SEEDED_ROLES) {
    const byName = new Map<RoleName, Role>();
    for (const role of roles) {
      if (byName.has(role.properties.roleName)) {
        throw new Error('Duplicate role name in catalog');
      }
      byName.set(role.properties.roleName, role);
    }
    this.rolesByRoleName = byName;
    this.allRoles = roles;
    this.roleHierarchy = new RoleHierarchy();
    Object.freeze(this);
  }

  public findByName(roleName: RoleName): Role | undefined {
    return this.rolesByRoleName.get(roleName);
  }

  public all(): readonly Role[] {
    return this.allRoles;
  }

  public hierarchy(): RoleHierarchy {
    return this.roleHierarchy;
  }
}
