import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { RoleName } from '../value-objects/role-name';
import type { RoleState } from '../value-objects/role-state';

/**
 * Part 6.2 §6–10 (Module 02 source material). A Role defines the categories of
 * permissions an identity may receive. Roles never authenticate an identity
 * and never grant permissions by themselves: permissions are granted through
 * the role's explicit granted-permission set and are evaluated independently
 * at decision time.
 *
 * The UuidV7/AggregateVersion primitives are shared platform value objects
 * defined by the identity-authentication module; Module 02 reuses them rather
 * than duplicating the platform primitives. This is a type/primitive reuse
 * only — Module 02 never reads Module 01 storage.
 */
export interface RoleProperties {
  readonly roleId: UuidV7;
  readonly roleName: RoleName;
  readonly state: RoleState;
  readonly grantedPermissionIds: readonly string[];
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Role {
  public readonly properties: Readonly<RoleProperties>;

  public constructor(properties: RoleProperties) {
    if (properties.grantedPermissionIds.length !== new Set(properties.grantedPermissionIds).size) {
      throw new Error('Role granted permissions must be unique');
    }
    this.properties = Object.freeze({
      ...properties,
      grantedPermissionIds: Object.freeze([...properties.grantedPermissionIds]),
    });
    Object.freeze(this);
  }
}
