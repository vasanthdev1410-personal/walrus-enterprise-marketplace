import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Role } from './role';

const ROLE_ID = new UuidV7('0191310f-789a-7000-8000-000000000001');
const NOW = new Date('2026-08-11T00:00:00.000Z');

describe('Role (M02 domain core)', () => {
  it('accepts a valid active role with an explicit granted-permission set', () => {
    const role = new Role({
      roleId: ROLE_ID,
      roleName: 'ADMIN',
      state: 'ACTIVE',
      grantedPermissionIds: ['recovery.approval.decide', 'identity.state.change'],
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(role.properties.roleName).toBe('ADMIN');
    expect(role.properties.grantedPermissionIds).toEqual([
      'recovery.approval.decide',
      'identity.state.change',
    ]);
  });

  it('accepts a role with an empty granted-permission set (least privilege)', () => {
    const role = new Role({
      roleId: ROLE_ID,
      roleName: 'CUSTOMER',
      state: 'ACTIVE',
      grantedPermissionIds: [],
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(role.properties.grantedPermissionIds).toEqual([]);
  });

  it('rejects duplicate granted permission identifiers', () => {
    expect(
      () =>
        new Role({
          roleId: ROLE_ID,
          roleName: 'ADMIN',
          state: 'ACTIVE',
          grantedPermissionIds: ['recovery.approval.decide', 'recovery.approval.decide'],
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
    ).toThrow('Role granted permissions must be unique');
  });

  it('freezes the granted-permission set and the instance', () => {
    const role = new Role({
      roleId: ROLE_ID,
      roleName: 'ADMIN',
      state: 'ACTIVE',
      grantedPermissionIds: ['recovery.approval.decide'],
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(Object.isFrozen(role)).toBe(true);
    expect(Object.isFrozen(role.properties.grantedPermissionIds)).toBe(true);
  });
});
