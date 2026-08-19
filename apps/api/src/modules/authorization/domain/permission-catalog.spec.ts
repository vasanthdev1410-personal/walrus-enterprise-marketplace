import { Permission } from './entities/permission';
import { PermissionCatalog } from './permission-catalog';

describe('PermissionCatalog (M02 domain core)', () => {
  it('seeds the Phase-1 permissions derived from the approved boundary contracts', () => {
    const catalog = new PermissionCatalog();

    const ids = catalog
      .all()
      .map((permission) => permission.properties.permissionId)
      .sort();
    expect(ids).toEqual([
      'authorization.permission.view',
      'authorization.role.assign',
      'authorization.role.revoke',
      'cart.admin.manage',
      'cart.admin.read',
      'cart.clear',
      'cart.item.add',
      'cart.item.remove',
      'cart.item.update',
      'cart.read',
      'catalog.attribute.manage',
      'catalog.category.manage',
      'catalog.category.read',
      'customer.address.manage',
      'customer.address.read',
      'customer.audit.view',
      'customer.business.manage',
      'customer.business.read',
      'customer.lifecycle.manage',
      'customer.preference.manage',
      'customer.preference.read',
      'customer.profile.read',
      'customer.profile.update',
      'customer.read',
      'identity.classification.change',
      'identity.privileged.provision',
      'identity.state.change',
      'identity.superadmin.bootstrap',
      'inventory.adjust.admin',
      'inventory.adjust.self',
      'inventory.audit.view',
      'inventory.read',
      'product.audit.view',
      'product.close',
      'product.create',
      'product.media.manage',
      'product.media.read',
      'product.read',
      'product.review.decide',
      'product.sku.manage',
      'product.submit',
      'product.update',
      'recovery.approval.decide',
      'seller.agreement.read',
      'seller.audit.view',
      'seller.evidence.read',
      'seller.member.manage',
      'seller.member.read',
      'seller.onboarding.create',
      'seller.onboarding.read',
      'seller.onboarding.submit',
      'seller.organization.read',
      'seller.organization.update',
      'seller.profile.close',
      'seller.profile.create',
      'seller.profile.read',
      'seller.profile.update',
      'seller.review.decide',
      'seller.suspend.manage',
      'seller.verification.read',
      'seller.verification.submit',
      'seller.warehouse.manage',
      'seller.warehouse.read',
    ]);
  });

  it('marks exactly the approved SELLER self-service set as organization-scoped (WEMP-M03-AUTHZ-001 §4)', () => {
    const catalog = new PermissionCatalog();

    const orgScoped = catalog
      .all()
      .filter((permission) => catalog.isOrganizationScoped(permission.properties.permissionId))
      .map((permission) => permission.properties.permissionId)
      .sort();
    expect(orgScoped).toEqual([
      'inventory.adjust.self',
      'inventory.read',
      'product.close',
      'product.create',
      'product.media.manage',
      'product.read',
      'product.sku.manage',
      'product.submit',
      'product.update',
      'seller.agreement.read',
      'seller.member.manage',
      'seller.member.read',
      'seller.onboarding.create',
      'seller.onboarding.read',
      'seller.onboarding.submit',
      'seller.organization.read',
      'seller.organization.update',
      'seller.profile.close',
      'seller.profile.create',
      'seller.profile.read',
      'seller.profile.update',
      'seller.verification.read',
      'seller.verification.submit',
      'seller.warehouse.manage',
      'seller.warehouse.read',
    ]);
    // The administrative seller permissions are never organization-scoped.
    for (const id of [
      'seller.review.decide',
      'seller.suspend.manage',
      'seller.evidence.read',
      'seller.audit.view',
      'product.review.decide',
      'product.audit.view',
      'catalog.category.manage',
      'catalog.attribute.manage',
      // WEMP-M05-AUTHZ-001 §4 (D-05): inventory admin identifiers are never
      // org-scoped — admins hold no seller association.
      'inventory.adjust.admin',
      'inventory.audit.view',
    ]) {
      expect(catalog.isOrganizationScoped(id)).toBe(false);
    }
    // Shared seller/admin read identifiers stay non-org-scoped (the org-scoped
    // flag is per-permission; marking them org-scoped would deny the
    // administrative rows since admins hold no seller association).
    expect(catalog.isOrganizationScoped('product.media.read')).toBe(false);
    expect(catalog.isOrganizationScoped('catalog.category.read')).toBe(false);
    expect(catalog.isOrganizationScoped('recovery.approval.decide')).toBe(false);
    expect(catalog.isOrganizationScoped('orders.export')).toBe(false);
    // WEMP-M06-AUTHZ-001 §2.1 (D-07, sign-off 2026-08-17): the CUSTOMER
    // self-service set is customer-identity-scoped, NOT organization-scoped —
    // customers hold no seller association.
    for (const id of [
      'customer.profile.read',
      'customer.profile.update',
      'customer.address.read',
      'customer.address.manage',
      'customer.business.read',
      'customer.business.manage',
      'customer.preference.read',
      'customer.preference.manage',
    ]) {
      expect(catalog.isOrganizationScoped(id)).toBe(false);
    }
    // WEMP-M07-AUTHZ-001 §2.1 (D-09, sign-off 2026-08-19): the CUSTOMER
    // self-service cart set is customer-identity-scoped, NOT org-scoped.
    for (const id of ['cart.read', 'cart.item.add', 'cart.item.update', 'cart.item.remove', 'cart.clear']) {
      expect(catalog.isOrganizationScoped(id)).toBe(false);
    }
  });

  it('marks exactly the approved CUSTOMER self-service set as customer-identity-scoped (WEMP-M06-AUTHZ-001 §4)', () => {
    const catalog = new PermissionCatalog();

    const customerScoped = catalog
      .all()
      .filter((permission) => catalog.isCustomerIdentityScoped(permission.properties.permissionId))
      .map((permission) => permission.properties.permissionId)
      .sort();
    expect(customerScoped).toEqual([
      'cart.clear',
      'cart.item.add',
      'cart.item.remove',
      'cart.item.update',
      'cart.read',
      'customer.address.manage',
      'customer.address.read',
      'customer.business.manage',
      'customer.business.read',
      'customer.preference.manage',
      'customer.preference.read',
      'customer.profile.read',
      'customer.profile.update',
    ]);
    // The administrative customer permissions are never customer-identity-
    // scoped — admins evaluate without a customer-identity scope.
    for (const id of ['customer.read', 'customer.lifecycle.manage', 'customer.audit.view']) {
      expect(catalog.isCustomerIdentityScoped(id)).toBe(false);
    }
    // WEMP-M07-AUTHZ-001 §2.1 (D-09, sign-off 2026-08-19): the CUSTOMER
    // self-service cart set is customer-identity-scoped (fourth scope).
    for (const id of ['cart.read', 'cart.item.add', 'cart.item.update', 'cart.item.remove', 'cart.clear']) {
      expect(catalog.isCustomerIdentityScoped(id)).toBe(true);
    }
    // The administrative cart permissions are never customer-identity-scoped.
    for (const id of ['cart.admin.read', 'cart.admin.manage']) {
      expect(catalog.isCustomerIdentityScoped(id)).toBe(false);
    }
    // No seller/product/inventory identifier is customer-identity-scoped.
    expect(catalog.isCustomerIdentityScoped('seller.profile.read')).toBe(false);
    expect(catalog.isCustomerIdentityScoped('inventory.read')).toBe(false);
    expect(catalog.isCustomerIdentityScoped('product.read')).toBe(false);
    expect(catalog.isCustomerIdentityScoped('recovery.approval.decide')).toBe(false);
  });

  it('finds a seeded permission by immutable identifier', () => {
    const catalog = new PermissionCatalog();

    const permission = catalog.find('recovery.approval.decide');
    expect(permission?.properties.name).toBe('Decide recovery approval requests');
  });

  it('returns undefined for an unknown permission identifier (implicit permissions are prohibited)', () => {
    const catalog = new PermissionCatalog();

    expect(catalog.find('orders.export')).toBeUndefined();
  });

  it('rejects duplicate permission identifiers', () => {
    const duplicate = new Permission({
      permissionId: 'recovery.approval.decide',
      name: 'Decide recovery approvals',
      protectedResource: 'recovery.approval',
      allowedAction: 'APPROVE',
      status: 'ACTIVE',
    });

    expect(() => new PermissionCatalog([duplicate, duplicate])).toThrow(
      'Duplicate permission identifier in catalog',
    );
  });
});
