import { AggregateVersion } from '../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Role } from './entities/role';
import { RoleCatalog } from './role-catalog';

const NOW = new Date('2026-08-11T00:00:00.000Z');

describe('RoleCatalog (M02 domain core)', () => {
  it('seeds the four approved Phase-1 roles in ACTIVE state', () => {
    const catalog = new RoleCatalog();

    expect(
      catalog
        .all()
        .map((role) => role.properties.roleName)
        .sort(),
    ).toEqual(['ADMIN', 'CUSTOMER', 'SELLER', 'SUPER_ADMIN']);
    for (const role of catalog.all()) {
      expect(role.properties.state).toBe('ACTIVE');
    }
  });

  it('finds roles by name and returns undefined for unknown roles', () => {
    const catalog = new RoleCatalog();

    expect(catalog.findByName('ADMIN')?.properties.roleId.value).toBe(
      '0191310f-789a-7000-8000-000000000002',
    );
    expect(catalog.findByName('SUPPORT_AGENT' as never)).toBeUndefined();
  });

  it('enforces the proposed matrix: Admin cannot provision privileged identities or bootstrap Super Admin', () => {
    const catalog = new RoleCatalog();

    const admin = catalog.findByName('ADMIN');
    const superAdmin = catalog.findByName('SUPER_ADMIN');

    expect(admin?.properties.grantedPermissionIds).toContain('recovery.approval.decide');
    expect(admin?.properties.grantedPermissionIds).not.toContain('identity.privileged.provision');
    expect(admin?.properties.grantedPermissionIds).not.toContain('identity.superadmin.bootstrap');
    expect(superAdmin?.properties.grantedPermissionIds).toContain('identity.privileged.provision');
    expect(superAdmin?.properties.grantedPermissionIds).toContain('identity.superadmin.bootstrap');
  });

  it('gives CUSTOMER exactly the approved customer self-service set and SELLER only the approved self-service set (D-11/D-07)', () => {
    const catalog = new RoleCatalog();

    // WEMP-M06-AUTHZ-001 §2.1 (D-07, sign-off 2026-08-17): the CUSTOMER role
    // holds exactly the eight customer-identity-scoped self-service
    // permissions — never an administrative customer permission.
    const customer = catalog.findByName('CUSTOMER');
    if (customer === undefined) {
      throw new Error('CUSTOMER role must exist');
    }
    expect([...customer.properties.grantedPermissionIds].sort()).toEqual([
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
    expect(customer.properties.grantedPermissionIds).not.toContain('customer.read');
    expect(customer.properties.grantedPermissionIds).not.toContain('customer.lifecycle.manage');
    expect(customer.properties.grantedPermissionIds).not.toContain('customer.audit.view');
    const seller = catalog.findByName('SELLER');
    if (seller === undefined) {
      throw new Error('SELLER role must exist');
    }
    expect([...seller.properties.grantedPermissionIds].sort()).toEqual([
      'catalog.category.read',
      'inventory.adjust.self',
      'inventory.read',
      'product.close',
      'product.create',
      'product.media.manage',
      'product.media.read',
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
    // SELLER never holds administrative seller permissions (no escalation).
    expect(seller.properties.grantedPermissionIds).not.toContain('seller.review.decide');
    expect(seller.properties.grantedPermissionIds).not.toContain('seller.suspend.manage');
    expect(seller.properties.grantedPermissionIds).not.toContain('seller.evidence.read');
    expect(seller.properties.grantedPermissionIds).not.toContain('seller.audit.view');
    // SELLER never holds product moderation/audit/category-management authority.
    expect(seller.properties.grantedPermissionIds).not.toContain('product.review.decide');
    expect(seller.properties.grantedPermissionIds).not.toContain('product.audit.view');
    expect(seller.properties.grantedPermissionIds).not.toContain('catalog.category.manage');
    expect(seller.properties.grantedPermissionIds).not.toContain('catalog.attribute.manage');
    // WEMP-M05-AUTHZ-001 §3 (D-05): SELLER never holds inventory
    // administrative permissions (no override, no escalation).
    expect(seller.properties.grantedPermissionIds).not.toContain('inventory.adjust.admin');
    expect(seller.properties.grantedPermissionIds).not.toContain('inventory.audit.view');
    // WEMP-M06-AUTHZ-001 §3 (D-07): SELLER never holds any customer
    // permission — no cross-role borrowing.
    expect(seller.properties.grantedPermissionIds).not.toContain('customer.profile.read');
    expect(seller.properties.grantedPermissionIds).not.toContain('customer.read');
  });

  it('grants ADMIN and SUPER_ADMIN exactly the approved seller administrative permissions (D-11)', () => {
    const catalog = new RoleCatalog();

    for (const roleName of ['ADMIN', 'SUPER_ADMIN'] as const) {
      const role = catalog.findByName(roleName);
      expect(role?.properties.grantedPermissionIds).toEqual(
        expect.arrayContaining([
          'seller.review.decide',
          'seller.suspend.manage',
          'seller.evidence.read',
          'seller.audit.view',
          'product.review.decide',
          'product.audit.view',
          'product.media.read',
          'catalog.category.read',
          'catalog.category.manage',
          'catalog.attribute.manage',
          // WEMP-M05-AUTHZ-001 §2.2 (D-05): inventory admin grants.
          'inventory.adjust.admin',
          'inventory.audit.view',
          // WEMP-M06-AUTHZ-001 §2.2 (D-07, sign-off 2026-08-17): customer
          // admin grants.
          'customer.read',
          'customer.lifecycle.manage',
          'customer.audit.view',
          // WEMP-M07-AUTHZ-001 §2.2 (D-09, sign-off 2026-08-19): cart admin grants.
          'cart.admin.read',
          'cart.admin.manage',
        ]),
      );
      // No customer self-service permission is granted to ADMIN/SUPER_ADMIN.
      expect(role?.properties.grantedPermissionIds).not.toContain('customer.profile.read');
      expect(role?.properties.grantedPermissionIds).not.toContain('customer.address.manage');
      // No cart self-service permission is granted to ADMIN/SUPER_ADMIN.
      expect(role?.properties.grantedPermissionIds).not.toContain('cart.read');
      expect(role?.properties.grantedPermissionIds).not.toContain('cart.item.add');
      // No seller self-service permission is granted to ADMIN/SUPER_ADMIN.
      expect(role?.properties.grantedPermissionIds).not.toContain('seller.profile.read');
      expect(role?.properties.grantedPermissionIds).not.toContain('seller.verification.submit');
      // WEMP-M05-AUTHZ-001 §3 (D-05): the seller self-service inventory set is
      // never granted to administrative roles — no cross-scope borrowing.
      expect(role?.properties.grantedPermissionIds).not.toContain('inventory.read');
      expect(role?.properties.grantedPermissionIds).not.toContain('inventory.adjust.self');
      // No seller-owned product mutation permission is granted to admins
      // (management stays seller-scoped; no override, D-11).
      expect(role?.properties.grantedPermissionIds).not.toContain('product.create');
      expect(role?.properties.grantedPermissionIds).not.toContain('product.update');
      expect(role?.properties.grantedPermissionIds).not.toContain('product.media.manage');
      expect(role?.properties.grantedPermissionIds).not.toContain('product.sku.manage');
      // Super Admin keeps the full Module 02 privileged scope; Admin does not.
      if (roleName === 'SUPER_ADMIN') {
        expect(role?.properties.grantedPermissionIds).toContain('identity.privileged.provision');
        expect(role?.properties.grantedPermissionIds).toContain('identity.superadmin.bootstrap');
      } else {
        expect(role?.properties.grantedPermissionIds).not.toContain(
          'identity.privileged.provision',
        );
        expect(role?.properties.grantedPermissionIds).not.toContain(
          'identity.superadmin.bootstrap',
        );
      }
    }
  });

  describe('role hierarchy (administrative scope only, Part 6.2 §7)', () => {
    const hierarchy = new RoleCatalog().hierarchy();

    it('Super Admin administers every other role', () => {
      expect(hierarchy.manages('SUPER_ADMIN', 'ADMIN')).toBe(true);
      expect(hierarchy.manages('SUPER_ADMIN', 'SELLER')).toBe(true);
      expect(hierarchy.manages('SUPER_ADMIN', 'CUSTOMER')).toBe(true);
    });

    it('Admin administers Seller and Customer but never Super Admin (no escalation)', () => {
      expect(hierarchy.manages('ADMIN', 'SELLER')).toBe(true);
      expect(hierarchy.manages('ADMIN', 'CUSTOMER')).toBe(true);
      expect(hierarchy.manages('ADMIN', 'SUPER_ADMIN')).toBe(false);
    });

    it('Seller administers Customer only', () => {
      expect(hierarchy.manages('SELLER', 'CUSTOMER')).toBe(true);
      expect(hierarchy.manages('SELLER', 'ADMIN')).toBe(false);
    });

    it('Customer administers nothing and no role administers itself', () => {
      expect(hierarchy.manages('CUSTOMER', 'SELLER')).toBe(false);
      for (const role of ['SUPER_ADMIN', 'ADMIN', 'SELLER', 'CUSTOMER'] as const) {
        expect(hierarchy.manages(role, role)).toBe(false);
      }
    });
  });

  it('rejects duplicate role names in a custom catalog', () => {
    const role = new Role({
      roleId: new UuidV7('0191310f-789a-7000-8000-000000000009'),
      roleName: 'ADMIN',
      state: 'ACTIVE',
      grantedPermissionIds: [],
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(() => new RoleCatalog([role, role])).toThrow('Duplicate role name in catalog');
  });
});
