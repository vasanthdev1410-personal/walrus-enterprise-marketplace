import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { IdentityRoleAssignment } from './identity-role-assignment';

const ASSIGNMENT_ID = new UuidV7('0191310f-789a-7123-8123-000000000001');
const IDENTITY_ID = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ASSIGNED_BY = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NOW = new Date('2026-08-11T00:00:00.000Z');

describe('IdentityRoleAssignment (M02 domain core)', () => {
  it('accepts an active assignment without revocation fields', () => {
    const assignment = new IdentityRoleAssignment({
      assignmentId: ASSIGNMENT_ID,
      identityId: IDENTITY_ID,
      roleName: 'ADMIN',
      assignmentState: 'ACTIVE',
      assignedByIdentityId: ASSIGNED_BY,
      assignedAt: NOW,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(assignment.properties.assignmentState).toBe('ACTIVE');
    expect(assignment.properties.revokedAt).toBeUndefined();
  });

  it('rejects a revoked assignment without revokedAt', () => {
    expect(
      () =>
        new IdentityRoleAssignment({
          assignmentId: ASSIGNMENT_ID,
          identityId: IDENTITY_ID,
          roleName: 'ADMIN',
          assignmentState: 'REVOKED',
          assignedByIdentityId: ASSIGNED_BY,
          assignedAt: NOW,
          revokedByIdentityId: ASSIGNED_BY,
          aggregateVersion: new AggregateVersion(2),
          createdAt: NOW,
          updatedAt: NOW,
        }),
    ).toThrow('Revoked Identity Role Assignment requires revokedAt');
  });

  it('rejects a revoked assignment without a revoking identity', () => {
    expect(
      () =>
        new IdentityRoleAssignment({
          assignmentId: ASSIGNMENT_ID,
          identityId: IDENTITY_ID,
          roleName: 'ADMIN',
          assignmentState: 'REVOKED',
          assignedByIdentityId: ASSIGNED_BY,
          assignedAt: NOW,
          revokedAt: NOW,
          aggregateVersion: new AggregateVersion(2),
          createdAt: NOW,
          updatedAt: NOW,
        }),
    ).toThrow('Revoked Identity Role Assignment requires revokedByIdentityId');
  });

  it('accepts a fully specified revoked assignment', () => {
    const assignment = new IdentityRoleAssignment({
      assignmentId: ASSIGNMENT_ID,
      identityId: IDENTITY_ID,
      roleName: 'ADMIN',
      assignmentState: 'REVOKED',
      assignedByIdentityId: ASSIGNED_BY,
      assignedAt: NOW,
      revokedByIdentityId: ASSIGNED_BY,
      revokedAt: NOW,
      aggregateVersion: new AggregateVersion(2),
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(assignment.properties.assignmentState).toBe('REVOKED');
    expect(Object.isFrozen(assignment.properties)).toBe(true);
  });
});
