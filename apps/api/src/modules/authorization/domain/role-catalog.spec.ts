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

  it('gives Customer and Seller no authorization-domain permission in Phase 1', () => {
    const catalog = new RoleCatalog();

    expect(catalog.findByName('CUSTOMER')?.properties.grantedPermissionIds).toEqual([]);
    expect(catalog.findByName('SELLER')?.properties.grantedPermissionIds).toEqual([]);
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
