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

/**
 * WEMP-M03-AUTHZ-001 §2.1 (approved D-11). The SELLER self-service
 * permissions granted to the SELLER role. All are organization-scoped through
 * the approved ownership resolver (WEMP-M03-AUTHZ-001 §4).
 */
const SELLER_PERMISSIONS = [
  'seller.profile.create',
  'seller.profile.read',
  'seller.profile.update',
  'seller.profile.close',
  'seller.organization.read',
  'seller.organization.update',
  'seller.onboarding.create',
  'seller.onboarding.submit',
  'seller.onboarding.read',
  'seller.verification.submit',
  'seller.verification.read',
  'seller.warehouse.read',
  'seller.warehouse.manage',
  'seller.agreement.read',
  'seller.member.read',
  'seller.member.manage',
  // WEMP-M04-AUTHZ-001 §2.1 (approved D-11): the SELLER self-service product
  // permissions. product.media.read and catalog.category.read are included for
  // the seller and are also granted to ADMIN/SUPER_ADMIN (shared identifiers,
  // not org-scoped — see permission-catalog.ts).
  'product.create',
  'product.read',
  'product.update',
  'product.submit',
  'product.close',
  'product.media.read',
  'product.media.manage',
  'product.sku.manage',
  'catalog.category.read',
  // WEMP-M05-AUTHZ-001 §2.1 (approved D-05, Module 02 owner sign-off
  // 2026-08-15): the SELLER self-service inventory permissions, both
  // organization-scoped through the approved ownership resolver (third scope).
  'inventory.read',
  'inventory.adjust.self',
] as const;

/**
 * WEMP-M03-AUTHZ-001 §2.2 (approved D-11). The seller administrative
 * permissions granted to ADMIN and SUPER_ADMIN exactly as approved — no
 * broader authority, no hidden override.
 */
const SELLER_ADMIN_PERMISSIONS = [
  'seller.review.decide',
  'seller.suspend.manage',
  'seller.evidence.read',
  'seller.audit.view',
] as const;

/**
 * WEMP-M04-AUTHZ-001 §2.2 (approved D-11). The product administrative
 * permissions granted to ADMIN and SUPER_ADMIN exactly as approved — no
 * broader authority, no hidden override (product.manage.override not
 * approved). product.media.read and catalog.category.read are the shared
 * identifiers also granted to SELLER (see permission-catalog.ts).
 */
const PRODUCT_ADMIN_PERMISSIONS = [
  'product.review.decide',
  'product.audit.view',
  'product.media.read',
  'catalog.category.read',
  'catalog.category.manage',
  'catalog.attribute.manage',
] as const;

/**
 * WEMP-M05-AUTHZ-001 §2.2 (approved D-05, Module 02 owner sign-off
 * 2026-08-15). The inventory administrative permissions granted to ADMIN and
 * SUPER_ADMIN exactly as approved — no override, no hidden bypass (D-05
 * no-override precedent). Never organization-scoped and never granted to the
 * SELLER role.
 */
const INVENTORY_ADMIN_PERMISSIONS = ['inventory.adjust.admin', 'inventory.audit.view'] as const;

/**
 * WEMP-M06-AUTHZ-001 §2.1 (approved D-07, Module 02 owner sign-off RECORDED
 * 2026-08-17). The CUSTOMER self-service permissions granted to the CUSTOMER
 * role. All are customer-identity-scoped through the approved fourth
 * ownership resolver (customer identity scope) — the caller's own Identity
 * must own the target customer profile.
 */
const CUSTOMER_PERMISSIONS = [
  'customer.profile.read',
  'customer.profile.update',
  'customer.address.read',
  'customer.address.manage',
  'customer.business.read',
  'customer.business.manage',
  'customer.preference.read',
  'customer.preference.manage',
  // WEMP-M07-AUTHZ-001 §2.1 (D-09, Module 02 owner sign-off RECORDED
  // 2026-08-19): the CUSTOMER self-service cart permissions, customer-
  // identity-scoped through the approved fourth ownership resolver.
  'cart.read',
  'cart.item.add',
  'cart.item.update',
  'cart.item.remove',
  'cart.clear',
  // WEMP-M08-AUTHZ-001 §2.1 (D-08, Module 02 owner sign-off RECORDED
  // 2026-08-20): the CUSTOMER self-service order permissions, customer-
  // identity-scoped through the approved fourth ownership resolver.
  'order.read',
  'order.create',
  // WEMP-M09-AUTHZ-001 §2.1: the CUSTOMER self-service payment permissions,
  // customer-identity-scoped through the approved fourth ownership resolver.
  'payment.initiate',
  'payment.read',
] as const;

/**
 * WEMP-M06-AUTHZ-001 §2.2 (approved D-07, Module 02 owner sign-off RECORDED
 * 2026-08-17). The customer administrative permissions granted to ADMIN and
 * SUPER_ADMIN exactly as approved — no override, no hidden bypass (D-07
 * no-override precedent). Never customer-identity-scoped and never granted
 * to the CUSTOMER role.
 */
const CUSTOMER_ADMIN_PERMISSIONS = [
  'customer.read',
  'customer.lifecycle.manage',
  'customer.audit.view',
  // WEMP-M07-AUTHZ-001 §2.2 (D-09, Module 02 owner sign-off RECORDED
  // 2026-08-19): the administrative cart permissions granted to ADMIN and
  // SUPER_ADMIN exactly as approved — no override, no hidden bypass.
  'cart.admin.read',
  'cart.admin.manage',
  // WEMP-M08-AUTHZ-001 §2.2 (D-08, Module 02 owner sign-off RECORDED
  // 2026-08-20): the administrative order permissions granted to ADMIN and
  // SUPER_ADMIN exactly as approved — no override, no hidden bypass.
  'order.admin.read',
  'order.admin.manage',
  // WEMP-M09-AUTHZ-001 §2.2: the administrative payment permissions granted
  // to ADMIN and SUPER_ADMIN exactly as approved — no override, no hidden bypass.
  'payment.admin.read',
  'payment.admin.manage',
] as const;

const SUPER_ADMIN_PERMISSIONS = [
  'recovery.approval.decide',
  'identity.state.change',
  'identity.classification.change',
  'identity.privileged.provision',
  'identity.superadmin.bootstrap',
  'authorization.role.assign',
  'authorization.role.revoke',
  'authorization.permission.view',
  ...SELLER_ADMIN_PERMISSIONS,
  ...PRODUCT_ADMIN_PERMISSIONS,
  ...INVENTORY_ADMIN_PERMISSIONS,
  ...CUSTOMER_ADMIN_PERMISSIONS,
] as const;

const ADMIN_PERMISSIONS = [
  'recovery.approval.decide',
  'identity.state.change',
  'identity.classification.change',
  'authorization.role.assign',
  'authorization.role.revoke',
  'authorization.permission.view',
  ...SELLER_ADMIN_PERMISSIONS,
  ...PRODUCT_ADMIN_PERMISSIONS,
  ...INVENTORY_ADMIN_PERMISSIONS,
  ...CUSTOMER_ADMIN_PERMISSIONS,
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
    grantedPermissionIds: [...SELLER_PERMISSIONS],
    aggregateVersion: new AggregateVersion(1),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  }),
  new Role({
    roleId: new UuidV7(ROLE_IDS.CUSTOMER),
    roleName: 'CUSTOMER',
    state: 'ACTIVE',
    grantedPermissionIds: [...CUSTOMER_PERMISSIONS],
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
