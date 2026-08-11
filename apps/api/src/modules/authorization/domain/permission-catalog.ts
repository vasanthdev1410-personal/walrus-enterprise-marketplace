import { Permission } from './entities/permission';

/**
 * Part 6.2 §8–9 (Module 02 source material). The centrally managed Phase-1
 * permission registry. Identifiers are immutable (`resource.action`). The
 * Phase-1 set is derived from the approved Module 02 boundary contracts
 * (recovery approval, identity state change, classification coordination,
 * privileged provisioning, bootstrap) plus Module 02's own role-management
 * operations. The proposed role → permission matrix is documented in
 * docs/module-02/implementation-spec.md §4 and must be confirmed at Module 02
 * approval.
 */
const SEEDED_PERMISSIONS: readonly Permission[] = Object.freeze([
  new Permission({
    permissionId: 'recovery.approval.decide',
    name: 'Decide recovery approval requests',
    protectedResource: 'recovery.approval',
    allowedAction: 'APPROVE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'identity.state.change',
    name: 'Change identity authentication state',
    protectedResource: 'identity',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'identity.classification.change',
    name: 'Change authentication-security classification',
    protectedResource: 'identity.classification',
    allowedAction: 'CONFIGURE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'identity.privileged.provision',
    name: 'Provision privileged identities',
    protectedResource: 'identity.provisioning',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'identity.superadmin.bootstrap',
    name: 'Bootstrap the initial Super Admin identity',
    protectedResource: 'identity.bootstrap',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'authorization.role.assign',
    name: 'Assign identity roles',
    protectedResource: 'authorization.assignment',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'authorization.role.revoke',
    name: 'Revoke identity roles',
    protectedResource: 'authorization.assignment',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'authorization.permission.view',
    name: 'View the authorization permission catalog',
    protectedResource: 'authorization.catalog',
    allowedAction: 'AUDIT',
    status: 'ACTIVE',
  }),
]);

export class PermissionCatalog {
  private readonly permissionsById: ReadonlyMap<string, Permission>;
  private readonly allPermissions: readonly Permission[];

  public constructor(permissions: readonly Permission[] = SEEDED_PERMISSIONS) {
    const byId = new Map<string, Permission>();
    for (const permission of permissions) {
      if (byId.has(permission.properties.permissionId)) {
        throw new Error('Duplicate permission identifier in catalog');
      }
      byId.set(permission.properties.permissionId, permission);
    }
    this.permissionsById = byId;
    this.allPermissions = permissions;
    Object.freeze(this);
  }

  public find(permissionId: string): Permission | undefined {
    return this.permissionsById.get(permissionId);
  }

  public all(): readonly Permission[] {
    return this.allPermissions;
  }
}
