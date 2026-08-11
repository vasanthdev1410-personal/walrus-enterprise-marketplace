import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AuthorizationDecisionRecord } from '../../../../domain/entities/authorization-decision-record';
import { IdentityRoleAssignment } from '../../../../domain/entities/identity-role-assignment';
import {
  authorizationDecisionRecordMapper,
  identityRoleAssignmentMapper,
} from './authorization.mapper';

const ASSIGNMENT_ID = new UuidV7('0191310f-789a-7123-8123-000000000001');
const IDENTITY_ID = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ACTOR = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NOW = new Date('2026-08-11T00:00:00.000Z');

describe('authorization mappers (M02 persistence)', () => {
  describe('identityRoleAssignmentMapper', () => {
    it('roundtrips an ACTIVE assignment', () => {
      const entity = new IdentityRoleAssignment({
        assignmentId: ASSIGNMENT_ID,
        identityId: IDENTITY_ID,
        roleName: 'ADMIN',
        assignmentState: 'ACTIVE',
        assignedByIdentityId: ACTOR,
        assignedAt: NOW,
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });

      const row = {
        assignmentId: ASSIGNMENT_ID.value,
        identityId: IDENTITY_ID.value,
        roleName: 'ADMIN',
        assignmentState: 'ACTIVE',
        assignedByIdentityId: ACTOR.value,
        assignedAt: NOW,
        revokedByIdentityId: null,
        revokedAt: null,
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
      };

      const restored = identityRoleAssignmentMapper.toDomain(
        row as Parameters<typeof identityRoleAssignmentMapper.toDomain>[0],
      );
      expect(restored.properties).toEqual(entity.properties);
      expect(identityRoleAssignmentMapper.toPersistence(entity)).toEqual({
        ...row,
        revokedByIdentityId: undefined,
        revokedAt: undefined,
      });
    });

    it('preserves revocation fields on a REVOKED assignment', () => {
      const entity = new IdentityRoleAssignment({
        assignmentId: ASSIGNMENT_ID,
        identityId: IDENTITY_ID,
        roleName: 'ADMIN',
        assignmentState: 'REVOKED',
        assignedByIdentityId: ACTOR,
        assignedAt: NOW,
        revokedByIdentityId: ACTOR,
        revokedAt: NOW,
        aggregateVersion: new AggregateVersion(2),
        createdAt: NOW,
        updatedAt: NOW,
      });

      const persistence = identityRoleAssignmentMapper.toPersistence(entity);
      expect(persistence.revokedByIdentityId).toBe(ACTOR.value);
      expect(persistence.revokedAt).toEqual(NOW);
    });
  });

  describe('authorizationDecisionRecordMapper', () => {
    it('roundtrips a denied record with optional fields', () => {
      const entity = new AuthorizationDecisionRecord({
        authorizationReference: 'azr:0123456789abcdef0123456789abcdef',
        subjectIdentityId: IDENTITY_ID,
        permissionId: 'recovery.approval.decide',
        resourceClassification: 'RESTRICTED',
        decisionOutcome: 'DENIED',
        denialReason: 'PERMISSION_NOT_GRANTED',
        sessionIdentifier: 'sess-1',
        correlationId: '0191310f-789a-7123-8123-000000000004',
        decidedAt: NOW,
        createdAt: NOW,
      });

      const row = {
        authorizationReference: entity.properties.authorizationReference,
        subjectIdentityId: IDENTITY_ID.value,
        permissionId: 'recovery.approval.decide',
        resourceClassification: 'RESTRICTED',
        decisionOutcome: 'DENIED',
        denialReason: 'PERMISSION_NOT_GRANTED',
        sessionIdentifier: 'sess-1',
        correlationId: '0191310f-789a-7123-8123-000000000004',
        decidedAt: NOW,
        createdAt: NOW,
      };

      const restored = authorizationDecisionRecordMapper.toDomain(
        row as Parameters<typeof authorizationDecisionRecordMapper.toDomain>[0],
      );
      expect(restored.properties).toEqual(entity.properties);
      expect(authorizationDecisionRecordMapper.toPersistence(entity)).toEqual(row);
    });

    it('omits optional fields when absent (compact persistence)', () => {
      const entity = new AuthorizationDecisionRecord({
        authorizationReference: 'azr:0123456789abcdef0123456789abcdef',
        subjectIdentityId: IDENTITY_ID,
        permissionId: 'identity.state.change',
        decisionOutcome: 'GRANTED',
        decidedAt: NOW,
        createdAt: NOW,
      });

      const persistence = authorizationDecisionRecordMapper.toPersistence(entity);
      expect(persistence.resourceClassification).toBeUndefined();
      expect(persistence.sessionIdentifier).toBeUndefined();
      expect(persistence.correlationId).toBeUndefined();
    });
  });
});
