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
}
