import { Permission } from './permission';

describe('Permission (M02 domain core)', () => {
  it('accepts a valid permission with an immutable dotted identifier', () => {
    const permission = new Permission({
      permissionId: 'recovery.approval.decide',
      name: 'Decide recovery approval requests',
      protectedResource: 'recovery.approval',
      allowedAction: 'APPROVE',
      status: 'ACTIVE',
    });

    expect(permission.properties).toEqual({
      permissionId: 'recovery.approval.decide',
      name: 'Decide recovery approval requests',
      protectedResource: 'recovery.approval',
      allowedAction: 'APPROVE',
      status: 'ACTIVE',
    });
    expect(Object.isFrozen(permission.properties)).toBe(true);
  });

  it.each([
    'Recovery.Approval',
    'recovery',
    'recovery-approval',
    'recovery.approval.',
    '.recovery.approval',
    '9recovery.approval',
  ])('rejects an invalid permission identifier (%s)', (permissionId) => {
    expect(
      () =>
        new Permission({
          permissionId,
          name: 'n',
          protectedResource: 'r',
          allowedAction: 'APPROVE',
          status: 'ACTIVE',
        }),
    ).toThrow('Permission identifier must be lowercase dotted resource.action');
  });

  it('rejects an empty name', () => {
    expect(
      () =>
        new Permission({
          permissionId: 'recovery.approval.decide',
          name: '   ',
          protectedResource: 'recovery.approval',
          allowedAction: 'APPROVE',
          status: 'ACTIVE',
        }),
    ).toThrow('Permission name is required');
  });

  it('rejects an empty protected resource', () => {
    expect(
      () =>
        new Permission({
          permissionId: 'recovery.approval.decide',
          name: 'Decide',
          protectedResource: '',
          allowedAction: 'APPROVE',
          status: 'ACTIVE',
        }),
    ).toThrow('Permission protected resource is required');
  });

  it('freezes the permission instance', () => {
    const permission = new Permission({
      permissionId: 'recovery.approval.decide',
      name: 'Decide',
      protectedResource: 'recovery.approval',
      allowedAction: 'APPROVE',
      status: 'ACTIVE',
    });

    expect(Object.isFrozen(permission)).toBe(true);
  });
});
