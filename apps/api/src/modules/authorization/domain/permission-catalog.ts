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
 *
 * WEMP-M03-AUTHZ-001 §2 (approved by D-11): the SELLER role catalog entry and
 * the `seller.*` permission identifiers below are the ONLY additive Module 02
 * authorization changes approved for Module 03. The 16 self-service
 * permissions are organization-scoped (resolved through the approved ownership
 * resolver); the 4 administrative permissions are granted to ADMIN and
 * SUPER_ADMIN exactly as specified in the approved matrix (no wildcard, no
 * override, no implicit permission).
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
  // --- Module 03 SELLER self-service permissions (WEMP-M03-AUTHZ-001 §2.1) ---
  // Every one of these is organization-scoped: the decision additionally
  // requires an ACTIVE SellerIdentityAssociation (ownership resolver).
  new Permission({
    permissionId: 'seller.profile.create',
    name: 'Create a seller profile (start onboarding)',
    protectedResource: 'seller.profile',
    allowedAction: 'CREATE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.profile.read',
    name: 'Read own seller profile and business status',
    protectedResource: 'seller.profile',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.profile.update',
    name: 'Update own seller profile fields (version-checked)',
    protectedResource: 'seller.profile',
    allowedAction: 'UPDATE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.profile.close',
    name: 'Voluntarily close own seller (terminal)',
    protectedResource: 'seller.profile',
    allowedAction: 'CLOSE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.organization.read',
    name: 'Read own organization/business information',
    protectedResource: 'seller.organization',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.organization.update',
    name: 'Update own business information',
    protectedResource: 'seller.organization',
    allowedAction: 'UPDATE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.onboarding.create',
    name: 'Create an onboarding draft',
    protectedResource: 'seller.onboarding',
    allowedAction: 'CREATE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.onboarding.submit',
    name: 'Submit onboarding for review (idempotent)',
    protectedResource: 'seller.onboarding',
    allowedAction: 'SUBMIT',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.onboarding.read',
    name: 'Read own onboarding progress/status',
    protectedResource: 'seller.onboarding',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.verification.submit',
    name: 'Submit KYC/KYB verification evidence',
    protectedResource: 'seller.verification',
    allowedAction: 'SUBMIT',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.verification.read',
    name: 'Read own verification status (never others)',
    protectedResource: 'seller.verification',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.warehouse.read',
    name: 'Read own warehouse/location records',
    protectedResource: 'seller.warehouse',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.warehouse.manage',
    name: 'Create/update/close own warehouse records',
    protectedResource: 'seller.warehouse',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.agreement.read',
    name: 'Read own agreements (incl. commission terms)',
    protectedResource: 'seller.agreement',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.member.read',
    name: 'Read own organization membership',
    protectedResource: 'seller.membership',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.member.manage',
    name: 'Manage members of own organization (owner action)',
    protectedResource: 'seller.membership',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  // --- Module 03 administrative permissions (WEMP-M03-AUTHZ-001 §2.2) ---
  // Granted to ADMIN and SUPER_ADMIN exactly as approved; never
  // organization-scoped and never inheritable by the SELLER role.
  new Permission({
    permissionId: 'seller.review.decide',
    name: 'Decide seller onboarding review (approve/reject/request corrections)',
    protectedResource: 'seller.review',
    allowedAction: 'DECIDE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.suspend.manage',
    name: 'Suspend/reactivate a seller',
    protectedResource: 'seller.suspend',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.evidence.read',
    name: 'Inspect KYC/KYB verification evidence (sensitive)',
    protectedResource: 'seller.evidence',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'seller.audit.view',
    name: 'Read seller business audit records and list/detail',
    protectedResource: 'seller.audit',
    allowedAction: 'VIEW',
    status: 'ACTIVE',
  }),
  // --- Module 04 PRODUCT self-service permissions (WEMP-M04-AUTHZ-001 §2.1) ---
  // Every one of these is seller-organization-scoped except the two shared
  // read identifiers granted to ADMIN/SUPER_ADMIN as well (product.media.read,
  // catalog.category.read): the org-scoped flag is per-permission, so a shared
  // identifier must not be org-scoped or the administrative rows would always
  // deny (admins hold no seller association). Seller-side scope for those reads
  // is enforced by the seller permission guard (server-side seller resolution)
  // and the Module 04 application layer (D-01 assertOwner).
  new Permission({
    permissionId: 'product.create',
    name: 'Create a DRAFT product',
    protectedResource: 'product',
    allowedAction: 'CREATE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'product.read',
    name: 'Read own products (never another seller)',
    protectedResource: 'product',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'product.update',
    name: 'Update own products (version-checked)',
    protectedResource: 'product',
    allowedAction: 'UPDATE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'product.submit',
    name: 'Submit product for moderation (idempotent)',
    protectedResource: 'product',
    allowedAction: 'SUBMIT',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'product.close',
    name: 'Withdraw/unpublish own product',
    protectedResource: 'product',
    allowedAction: 'CLOSE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'product.media.read',
    name: 'Read own product media metadata (seller) / inspect (admin)',
    protectedResource: 'product.media',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'product.media.manage',
    name: 'Upload/replace own product media references+digests',
    protectedResource: 'product.media',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'product.sku.manage',
    name: 'Manage SKUs on own products',
    protectedResource: 'product.sku',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'catalog.category.read',
    name: 'Read platform categories',
    protectedResource: 'catalog.category',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  // --- Module 04 administrative permissions (WEMP-M04-AUTHZ-001 §2.2) ---
  // Granted to ADMIN and SUPER_ADMIN exactly as approved (D-11: no override,
  // no hidden bypass); never organization-scoped and never inheritable by the
  // SELLER role.
  new Permission({
    permissionId: 'product.review.decide',
    name: 'Decide product review (approve/reject/request corrections)',
    protectedResource: 'product.review',
    allowedAction: 'DECIDE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'product.audit.view',
    name: 'Read product list/detail and audit records',
    protectedResource: 'product.audit',
    allowedAction: 'VIEW',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'catalog.category.manage',
    name: 'Create/update/retire platform categories',
    protectedResource: 'catalog.category',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'catalog.attribute.manage',
    name: 'Create/update/retire attribute definitions',
    protectedResource: 'catalog.attribute',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  // --- Module 05 INVENTORY permissions (WEMP-M05-AUTHZ-001 §2, D-05) ---
  // Four additive identifiers, OWNER-APPROVED 2026-08-14 (D-05, option A);
  // Module 02 owner sign-off RECORDED 2026-08-15 (A-09/D-05). The two
  // self-service identifiers are seller-organization-scoped (approved third
  // ownership-resolver scope); the two administrative identifiers are granted
  // to ADMIN/SUPER_ADMIN exactly as approved — no override, no wildcard.
  new Permission({
    permissionId: 'inventory.read',
    name: 'Read own-SKU stock and derived labels (seller, org-scoped)',
    protectedResource: 'inventory',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'inventory.adjust.self',
    name: 'Adjust own-SKU stock (seller OWNER, org-scoped)',
    protectedResource: 'inventory',
    allowedAction: 'ADJUST',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'inventory.adjust.admin',
    name: 'Administrative stock corrections and threshold config changes',
    protectedResource: 'inventory',
    allowedAction: 'ADJUST',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'inventory.audit.view',
    name: 'View stock list/detail, movement ledger and audit records',
    protectedResource: 'inventory.audit',
    allowedAction: 'VIEW',
    status: 'ACTIVE',
  }),
  // --- Module 06 CUSTOMER self-service permissions (WEMP-M06-AUTHZ-001 §2.1) ---
  // Every one of these is customer-identity-scoped (the approved fourth
  // ownership-resolver scope): the decision additionally requires that the
  // target customer profile is owned by the caller's authenticated Identity
  // (CustomerProfile.identityId match, resolved server-side). Granted only
  // to the CUSTOMER role; never administrative, never org-scoped.
  new Permission({
    permissionId: 'customer.profile.read',
    name: 'Read own customer profile',
    protectedResource: 'customer.profile',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'customer.profile.update',
    name: 'Update own customer profile fields (version-checked)',
    protectedResource: 'customer.profile',
    allowedAction: 'UPDATE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'customer.address.read',
    name: 'List/read own addresses',
    protectedResource: 'customer.address',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'customer.address.manage',
    name: 'Create/update/soft-remove own addresses; set defaults',
    protectedResource: 'customer.address',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'customer.business.read',
    name: 'Read own optional business profile',
    protectedResource: 'customer.business',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'customer.business.manage',
    name: 'Create/update own optional business profile (version-checked)',
    protectedResource: 'customer.business',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'customer.preference.read',
    name: 'Read own basic account preferences',
    protectedResource: 'customer.preference',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'customer.preference.manage',
    name: 'Update own basic preferences (allow-listed keys, version-checked)',
    protectedResource: 'customer.preference',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  // --- Module 06 administrative permissions (WEMP-M06-AUTHZ-001 §2.2) ---
  // Granted to ADMIN and SUPER_ADMIN exactly as approved (D-07 no-override
  // precedent); never customer-identity-scoped and never inheritable by the
  // CUSTOMER role.
  new Permission({
    permissionId: 'customer.read',
    name: 'Read customer list/detail (non-enumerating)',
    protectedResource: 'customer',
    allowedAction: 'READ',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'customer.lifecycle.manage',
    name: 'Suspend/reinstate/close customer profiles (mandatory reason)',
    protectedResource: 'customer.lifecycle',
    allowedAction: 'MANAGE',
    status: 'ACTIVE',
  }),
  new Permission({
    permissionId: 'customer.audit.view',
    name: 'View customer audit trail',
    protectedResource: 'customer.audit',
    allowedAction: 'VIEW',
    status: 'ACTIVE',
  }),
]);

/**
 * The approved organization-scoped SELLER self-service permission set
 * (WEMP-M03-AUTHZ-001 §4 / WEMP-M03-SPEC-001 §12.2). A decision for any of
 * these additionally requires an ACTIVE SellerIdentityAssociation binding the
 * caller to the target seller profile, resolved through the approved ownership
 * resolver. The administrative `seller.*` permissions are NOT in this set.
 */
const ORGANIZATION_SCOPED_PERMISSIONS: ReadonlySet<string> = new Set([
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
  // WEMP-M04-AUTHZ-001 §4 (D-11, matrix decision 2026-08-14): the seller-
  // exclusive product self-service set. product.media.read and
  // catalog.category.read are intentionally NOT in this set — they are also
  // granted to ADMIN/SUPER_ADMIN, and the org-scoped flag is per-permission,
  // so marking them org-scoped would deny every administrative evaluation.
  'product.create',
  'product.read',
  'product.update',
  'product.submit',
  'product.close',
  'product.media.manage',
  'product.sku.manage',
  // WEMP-M05-AUTHZ-001 §4 (D-05, Module 02 owner sign-off 2026-08-15): the
  // seller self-service inventory set — inventory.read (MEMBER read-only) and
  // inventory.adjust.self (OWNER only). The administrative inventory
  // identifiers (inventory.adjust.admin, inventory.audit.view) are NOT in
  // this set: admins hold no seller association.
  'inventory.read',
  'inventory.adjust.self',
]);

/**
 * The approved customer-identity-scoped CUSTOMER self-service permission set
 * (WEMP-M06-AUTHZ-001 §4, decision D-07; Module 02 owner sign-off RECORDED
 * 2026-08-17). A decision for any of these additionally requires that the
 * caller's authenticated Identity owns the target customer profile
 * (CustomerProfile.identityId match), resolved through the approved fourth
 * ownership resolver (customer identity scope). The administrative
 * `customer.*` permissions are NOT in this set — admins evaluate without a
 * customer-identity scope.
 */
const CUSTOMER_IDENTITY_SCOPED_PERMISSIONS: ReadonlySet<string> = new Set([
  'customer.profile.read',
  'customer.profile.update',
  'customer.address.read',
  'customer.address.manage',
  'customer.business.read',
  'customer.business.manage',
  'customer.preference.read',
  'customer.preference.manage',
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

  /**
   * True when the permission is organization-scoped (the approved SELLER
   * self-service set). Such permissions are granted only when the caller holds
   * an ACTIVE association to the target seller — evaluated through the
   * ownership resolver, never from client-provided claims alone.
   */
  public isOrganizationScoped(permissionId: string): boolean {
    return ORGANIZATION_SCOPED_PERMISSIONS.has(permissionId);
  }

  /**
   * WEMP-M06-AUTHZ-001 §4 (decision D-07; Module 02 owner sign-off RECORDED
   * 2026-08-17). True when the permission is customer-identity-scoped (the
   * approved CUSTOMER self-service set, fourth ownership-resolver scope).
   * Such permissions are granted only when the caller's authenticated
   * Identity owns the target customer profile — evaluated through the
   * customer ownership resolver, never from client-provided claims alone.
   */
  public isCustomerIdentityScoped(permissionId: string): boolean {
    return CUSTOMER_IDENTITY_SCOPED_PERMISSIONS.has(permissionId);
  }
}
