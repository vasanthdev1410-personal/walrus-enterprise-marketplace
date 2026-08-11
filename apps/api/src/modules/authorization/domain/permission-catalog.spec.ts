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
      'identity.classification.change',
      'identity.privileged.provision',
      'identity.state.change',
      'identity.superadmin.bootstrap',
      'recovery.approval.decide',
    ]);
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
