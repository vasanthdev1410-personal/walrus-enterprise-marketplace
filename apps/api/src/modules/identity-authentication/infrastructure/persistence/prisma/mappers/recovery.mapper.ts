import type {
  Prisma,
  RecoveryApprovalRecord as RecoveryApprovalPersistenceRecord,
  RecoveryAttempt as RecoveryAttemptRecord,
  RecoveryEvidenceRecord as RecoveryEvidencePersistenceRecord,
  RecoveryNotificationRecord as RecoveryNotificationPersistenceRecord,
  RecoveryRequest as RecoveryRequestRecord,
  RecoveryStateTransition as RecoveryStateTransitionRecord,
} from '../../../../../../generated/prisma/client';
import { RecoveryApprovalRecord } from '../../../../domain/recovery/entities/recovery-approval-record';
import { RecoveryAttempt } from '../../../../domain/recovery/entities/recovery-attempt';
import { RecoveryEvidenceRecord } from '../../../../domain/recovery/entities/recovery-evidence-record';
import { RecoveryNotificationRecord } from '../../../../domain/recovery/entities/recovery-notification-record';
import { RecoveryRequest } from '../../../../domain/recovery/entities/recovery-request';
import { RecoveryStateTransition } from '../../../../domain/recovery/entities/recovery-state-transition';
import { PermittedRecoveryOperation } from '../../../../domain/recovery/value-objects/permitted-recovery-operation';
import { RecoveryPolicyVersion } from '../../../../domain/recovery/value-objects/recovery-policy-version';
import { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../domain/shared/value-objects/correlation-identifier';
import { ProtectedValue } from '../../../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import { compactProperties } from './compact-properties';

export const recoveryRequestMapper = {
  toDomain(record: RecoveryRequestRecord): RecoveryRequest {
    return new RecoveryRequest(
      compactProperties({
        recoveryRequestId: new UuidV7(record.recoveryRequestId),
        identityId: new UuidV7(record.identityId),
        operationClass: record.operationClass,
        recoveryState: record.recoveryState,
        recoveryAssurance: record.recoveryAssurance,
        recoveryPolicyVersion: new RecoveryPolicyVersion(record.recoveryPolicyVersion),
        permittedOperation: new PermittedRecoveryOperation(record.permittedOperation),
        stateVersion: record.stateVersion,
        expiresAt: record.expiresAt,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        approvedAt: record.approvedAt ?? undefined,
        executionStartedAt: record.executionStartedAt ?? undefined,
        completedAt: record.completedAt ?? undefined,
        terminalReason: record.terminalReason ?? undefined,
        idempotencyKey: record.idempotencyKey ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(entity: RecoveryRequest): Prisma.RecoveryRequestUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      recoveryRequestId: value.recoveryRequestId.value,
      identityId: value.identityId.value,
      operationClass: value.operationClass,
      recoveryState: value.recoveryState,
      recoveryAssurance: value.recoveryAssurance,
      recoveryPolicyVersion: value.recoveryPolicyVersion.value,
      permittedOperation: value.permittedOperation.value,
      stateVersion: value.stateVersion,
      expiresAt: value.expiresAt,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      approvedAt: value.approvedAt,
      executionStartedAt: value.executionStartedAt,
      completedAt: value.completedAt,
      terminalReason: value.terminalReason,
      idempotencyKey: value.idempotencyKey,
      correlationId: value.correlationId?.value,
    });
  },
};

export const recoveryEvidenceMapper = {
  toDomain(record: RecoveryEvidencePersistenceRecord): RecoveryEvidenceRecord {
    return new RecoveryEvidenceRecord(
      compactProperties({
        recoveryEvidenceId: new UuidV7(record.recoveryEvidenceId),
        recoveryRequestId: new UuidV7(record.recoveryRequestId),
        evidenceType: record.evidenceType,
        protectedEvidenceReference: new ProtectedValue(record.protectedEvidenceOrReference),
        evidenceState: record.evidenceState,
        evidenceBoundary: record.evidenceBoundary,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        verifiedAt: record.verifiedAt ?? undefined,
        consumedAt: record.consumedAt ?? undefined,
        failureReason: record.failureReason ?? undefined,
      }),
    );
  },
  toPersistence(entity: RecoveryEvidenceRecord): Prisma.RecoveryEvidenceRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      recoveryEvidenceId: value.recoveryEvidenceId.value,
      recoveryRequestId: value.recoveryRequestId.value,
      evidenceType: value.evidenceType,
      protectedEvidenceOrReference: value.protectedEvidenceReference.value,
      evidenceState: value.evidenceState,
      evidenceBoundary: value.evidenceBoundary,
      expiresAt: value.expiresAt,
      createdAt: value.createdAt,
      verifiedAt: value.verifiedAt,
      consumedAt: value.consumedAt,
      failureReason: value.failureReason,
    });
  },
};

export const recoveryApprovalMapper = {
  toDomain(record: RecoveryApprovalPersistenceRecord): RecoveryApprovalRecord {
    return new RecoveryApprovalRecord(
      compactProperties({
        recoveryApprovalId: new UuidV7(record.recoveryApprovalId),
        recoveryRequestId: new UuidV7(record.recoveryRequestId),
        recoveredIdentityId: new UuidV7(record.recoveredIdentityId),
        operation: new PermittedRecoveryOperation(record.operationClass),
        approverIdentityId: new UuidV7(record.approverIdentityId),
        approverAuthenticationEvidenceReference: new ProtectedValue(
          record.authorizationEvidenceReference,
        ),
        decision: record.decision,
        decidedAt: record.decidedAt,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(entity: RecoveryApprovalRecord): Prisma.RecoveryApprovalRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      recoveryApprovalId: value.recoveryApprovalId.value,
      recoveryRequestId: value.recoveryRequestId.value,
      recoveredIdentityId: value.recoveredIdentityId.value,
      operationClass: value.operation.value,
      approverIdentityId: value.approverIdentityId.value,
      authorizationEvidenceReference: value.approverAuthenticationEvidenceReference.value,
      decision: value.decision,
      decidedAt: value.decidedAt,
      expiresAt: value.expiresAt,
      createdAt: value.createdAt,
    });
  },
};

export const recoveryAttemptMapper = {
  toDomain(record: RecoveryAttemptRecord): RecoveryAttempt {
    return new RecoveryAttempt(
      compactProperties({
        recoveryAttemptId: new UuidV7(record.recoveryAttemptId),
        recoveryRequestId: new UuidV7(record.recoveryRequestId),
        attemptType: record.attemptType,
        outcome: record.outcome,
        attemptedAt: record.attemptedAt,
        createdAt: record.createdAt,
        failureReason: record.failureReason ?? undefined,
        protectedSourceIpReference:
          record.sourceIpReference === null
            ? undefined
            : new ProtectedValue(record.sourceIpReference),
        protectedDeviceReference:
          record.deviceReference === null ? undefined : new ProtectedValue(record.deviceReference),
      }),
    );
  },
  toPersistence(entity: RecoveryAttempt): Prisma.RecoveryAttemptUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      recoveryAttemptId: value.recoveryAttemptId.value,
      recoveryRequestId: value.recoveryRequestId.value,
      attemptType: value.attemptType,
      outcome: value.outcome,
      attemptedAt: value.attemptedAt,
      createdAt: value.createdAt,
      failureReason: value.failureReason,
      sourceIpReference: value.protectedSourceIpReference?.value,
      deviceReference: value.protectedDeviceReference?.value,
    });
  },
};

export const recoveryStateTransitionMapper = {
  toDomain(record: RecoveryStateTransitionRecord): RecoveryStateTransition {
    return new RecoveryStateTransition(
      compactProperties({
        recoveryStateTransitionId: new UuidV7(record.recoveryTransitionId),
        recoveryRequestId: new UuidV7(record.recoveryRequestId),
        fromState: record.fromState,
        toState: record.toState,
        stateVersion: record.stateVersion,
        transitionedAt: record.transitionedAt,
        createdAt: record.createdAt,
        actorIdentityId:
          record.actorIdentityId === null ? undefined : new UuidV7(record.actorIdentityId),
        reasonCode: record.reasonCode ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(
    entity: RecoveryStateTransition,
  ): Prisma.RecoveryStateTransitionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      recoveryTransitionId: value.recoveryStateTransitionId.value,
      recoveryRequestId: value.recoveryRequestId.value,
      fromState: value.fromState,
      toState: value.toState,
      stateVersion: value.stateVersion,
      transitionedAt: value.transitionedAt,
      createdAt: value.createdAt,
      actorIdentityId: value.actorIdentityId?.value,
      reasonCode: value.reasonCode,
      correlationId: value.correlationId?.value,
    });
  },
};

export const recoveryNotificationMapper = {
  toDomain(record: RecoveryNotificationPersistenceRecord): RecoveryNotificationRecord {
    return new RecoveryNotificationRecord(
      compactProperties({
        recoveryNotificationId: new UuidV7(record.recoveryNotificationId),
        recoveryRequestId: new UuidV7(record.recoveryRequestId),
        notificationType: record.notificationType,
        deliveryState: record.deliveryState,
        protectedDestinationReference: new ProtectedValue(record.destinationReference),
        createdAt: record.createdAt,
        deliveredAt: record.deliveredAt ?? undefined,
        failedAt: record.failedAt ?? undefined,
        failureReason: record.failureReason ?? undefined,
      }),
    );
  },
  toPersistence(
    entity: RecoveryNotificationRecord,
  ): Prisma.RecoveryNotificationRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      recoveryNotificationId: value.recoveryNotificationId.value,
      recoveryRequestId: value.recoveryRequestId.value,
      notificationType: value.notificationType,
      deliveryState: value.deliveryState,
      destinationReference: value.protectedDestinationReference.value,
      createdAt: value.createdAt,
      deliveredAt: value.deliveredAt,
      failedAt: value.failedAt,
      failureReason: value.failureReason,
    });
  },
};
