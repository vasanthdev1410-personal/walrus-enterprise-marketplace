import type {
  AuthorizationDecisionRecord as AuthorizationDecisionRecordRow,
  IdentityRoleAssignment as IdentityRoleAssignmentRow,
  Prisma,
} from '../../../../../../generated/prisma/client';
import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { compactProperties } from '../../../../../identity-authentication/infrastructure/persistence/prisma/mappers/compact-properties';
import { AuthorizationDecisionRecord } from '../../../../domain/entities/authorization-decision-record';
import { IdentityRoleAssignment } from '../../../../domain/entities/identity-role-assignment';
import {
  AUTHORIZATION_DENIAL_REASONS,
  type AuthorizationDenialReason,
} from '../../../../domain/value-objects/authorization-denial-reason';
import {
  RESOURCE_CLASSIFICATIONS,
  type ResourceClassification,
} from '../../../../domain/value-objects/resource-classification';

/**
 * The persisted resource-classification column is free text; unknown values
 * fail closed rather than entering the domain model (Part 6.3 §11).
 */
function toResourceClassification(value: string | null): ResourceClassification | undefined {
  if (value === null) {
    return undefined;
  }
  if (!(RESOURCE_CLASSIFICATIONS as readonly string[]).includes(value)) {
    throw new Error(
      `Unknown resource classification in persisted authorization decision record: ${value}`,
    );
  }
  return value as ResourceClassification;
}

/**
 * The persisted denial-reason column is free text; unknown values fail closed
 * rather than entering the domain model (Part 6.5 §24).
 */
function toDenialReason(value: string | null): AuthorizationDenialReason | undefined {
  if (value === null) {
    return undefined;
  }
  if (!(AUTHORIZATION_DENIAL_REASONS as readonly string[]).includes(value)) {
    throw new Error(`Unknown denial reason in persisted authorization decision record: ${value}`);
  }
  return value as AuthorizationDenialReason;
}

/**
 * Module 02 persistence mappers. The shared platform primitives (UuidV7,
 * AggregateVersion) and the generic compactProperties helper are reused from
 * the identity-authentication module; Module 02 never reads Module 01 storage.
 */
export const identityRoleAssignmentMapper = {
  toDomain(record: IdentityRoleAssignmentRow): IdentityRoleAssignment {
    return new IdentityRoleAssignment(
      compactProperties({
        assignmentId: new UuidV7(record.assignmentId),
        identityId: new UuidV7(record.identityId),
        roleName: record.roleName,
        assignmentState: record.assignmentState,
        assignedByIdentityId: new UuidV7(record.assignedByIdentityId),
        assignedAt: record.assignedAt,
        revokedByIdentityId:
          record.revokedByIdentityId === null ? undefined : new UuidV7(record.revokedByIdentityId),
        revokedAt: record.revokedAt ?? undefined,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(entity: IdentityRoleAssignment): Prisma.IdentityRoleAssignmentUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      assignmentId: value.assignmentId.value,
      identityId: value.identityId.value,
      roleName: value.roleName,
      assignmentState: value.assignmentState,
      assignedByIdentityId: value.assignedByIdentityId.value,
      assignedAt: value.assignedAt,
      revokedByIdentityId: value.revokedByIdentityId?.value,
      revokedAt: value.revokedAt,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const authorizationDecisionRecordMapper = {
  toDomain(record: AuthorizationDecisionRecordRow): AuthorizationDecisionRecord {
    return new AuthorizationDecisionRecord(
      compactProperties({
        authorizationReference: record.authorizationReference,
        actorIdentityId:
          record.actorIdentityId == null ? undefined : new UuidV7(record.actorIdentityId),
        subjectIdentityId: new UuidV7(record.subjectIdentityId),
        permissionId: record.permissionId,
        resourceClassification: toResourceClassification(record.resourceClassification),
        decisionOutcome: record.decisionOutcome,
        denialReason: toDenialReason(record.denialReason),
        sessionIdentifier: record.sessionIdentifier ?? undefined,
        correlationId: record.correlationId ?? undefined,
        decidedAt: record.decidedAt,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(
    entity: AuthorizationDecisionRecord,
  ): Prisma.AuthorizationDecisionRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      authorizationReference: value.authorizationReference,
      actorIdentityId: value.actorIdentityId?.value,
      subjectIdentityId: value.subjectIdentityId.value,
      permissionId: value.permissionId,
      resourceClassification: value.resourceClassification,
      decisionOutcome: value.decisionOutcome,
      denialReason: value.denialReason,
      sessionIdentifier: value.sessionIdentifier,
      correlationId: value.correlationId,
      decidedAt: value.decidedAt,
      createdAt: value.createdAt,
    });
  },
};
