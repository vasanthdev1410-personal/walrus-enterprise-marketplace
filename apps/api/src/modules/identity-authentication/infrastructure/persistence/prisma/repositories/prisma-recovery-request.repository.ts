import { Injectable } from '@nestjs/common';
import type { RecoveryApprovalRecord } from '../../../../domain/recovery/entities/recovery-approval-record';
import type { RecoveryEvidenceRecord } from '../../../../domain/recovery/entities/recovery-evidence-record';
import type { RecoveryRequest } from '../../../../domain/recovery/entities/recovery-request';
import type {
  ExecuteRecoveryPersistenceCommand,
  RecoveryAggregateChangeSet,
  RecordApprovalDecisionPersistenceCommand,
  RecoveryRequestRepository,
  SubmitRecoveryCodeEvidencePersistenceCommand,
} from '../../../../domain/recovery/repositories/recovery-request-repository';
import { OptimisticConcurrencyError } from '../../../../domain/shared/errors/optimistic-concurrency.error';
import type { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import {
  recoveryApprovalMapper,
  recoveryAttemptMapper,
  recoveryEvidenceMapper,
  recoveryNotificationMapper,
  recoveryRequestMapper,
  recoveryStateTransitionMapper,
} from '../mappers/recovery.mapper';
import { PrismaService } from '../prisma.service';
import { assertVersionUpdated, type TransactionClient } from './repository-support';

@Injectable()
export class PrismaRecoveryRequestRepository implements RecoveryRequestRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(recoveryRequestId: UuidV7): Promise<RecoveryRequest | null> {
    const record = await this.prisma.recoveryRequest.findUnique({
      where: { recoveryRequestId: recoveryRequestId.value },
    });
    return record === null ? null : recoveryRequestMapper.toDomain(record);
  }

  public async findEvidence(recoveryRequestId: UuidV7): Promise<readonly RecoveryEvidenceRecord[]> {
    const records = await this.prisma.recoveryEvidenceRecord.findMany({
      where: { recoveryRequestId: recoveryRequestId.value },
    });
    return records.map((record) => recoveryEvidenceMapper.toDomain(record));
  }

  public async findApprovalRecords(
    recoveryRequestId: UuidV7,
  ): Promise<readonly RecoveryApprovalRecord[]> {
    const records = await this.prisma.recoveryApprovalRecord.findMany({
      where: { recoveryRequestId: recoveryRequestId.value },
    });
    return records.map((record) => recoveryApprovalMapper.toDomain(record));
  }

  public async insert(changeSet: RecoveryAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.recoveryRequest.create({
        data: recoveryRequestMapper.toPersistence(changeSet.recoveryRequest),
      });
      await this.persistOwnedRecords(transaction, changeSet, false);
    });
  }

  public async save(
    changeSet: RecoveryAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.recoveryRequest.updateMany({
        where: {
          recoveryRequestId: changeSet.recoveryRequest.properties.recoveryRequestId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: recoveryRequestMapper.toPersistence(changeSet.recoveryRequest),
      });
      assertVersionUpdated(result.count, 'RecoveryRequest');
      await this.persistOwnedRecords(transaction, changeSet, true);
    });
  }

  public async recordApprovalDecision(
    command: RecordApprovalDecisionPersistenceCommand,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.recoveryRequest.updateMany({
        where: {
          recoveryRequestId: command.recoveryRequestId.value,
          aggregateVersion: command.expectedRecoveryVersion.value,
        },
        data: recoveryRequestMapper.toPersistence(command.updatedRecoveryRequest),
      });
      if (updated.count !== 1) {
        throw new OptimisticConcurrencyError('RecoveryRequest');
      }
      try {
        await transaction.recoveryApprovalRecord.create({
          data: recoveryApprovalMapper.toPersistence(command.approvalRecord),
        });
      } catch (error) {
        // The unique (recoveryRequestId, approverIdentityId) constraint is the
        // atomic duplicate guard: a concurrent second decision from the same
        // approver cannot commit and the whole change set rolls back, so a
        // duplicate approval can never be recorded.
        if (isPrismaUniqueViolation(error)) {
          throw new OptimisticConcurrencyError('RecoveryApprovalRecord');
        }
        throw error;
      }
      for (const transition of command.transitionsToAppend) {
        await transaction.recoveryStateTransition.create({
          data: recoveryStateTransitionMapper.toPersistence(transition),
        });
      }
    });
  }

  public async executeRecovery(command: ExecuteRecoveryPersistenceCommand): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      // Single-winner execution gate: the version guard plus the
      // executable-state guard (APPROVED, or EVIDENCE_VERIFIED when approval is
      // not required) make the transition to COMPLETED atomic. A concurrent
      // execution or a stale caller cannot re-apply completion; the transaction
      // rolls back with OptimisticConcurrencyError and no state is mutated.
      const updated = await transaction.recoveryRequest.updateMany({
        where: {
          recoveryRequestId: command.recoveryRequestId.value,
          aggregateVersion: command.expectedRecoveryVersion.value,
          recoveryState: { in: ['APPROVED', 'EVIDENCE_VERIFIED'] },
        },
        data: recoveryRequestMapper.toPersistence(command.updatedRecoveryRequest),
      });
      if (updated.count !== 1) {
        throw new OptimisticConcurrencyError('RecoveryRequest');
      }
      for (const transition of command.transitionsToAppend) {
        await transaction.recoveryStateTransition.create({
          data: recoveryStateTransitionMapper.toPersistence(transition),
        });
      }
      if (command.notification !== undefined) {
        await transaction.recoveryNotificationRecord.create({
          data: recoveryNotificationMapper.toPersistence(command.notification),
        });
      }
    });
  }

  public async submitRecoveryCodeEvidence(
    command: SubmitRecoveryCodeEvidencePersistenceCommand,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      // Single-use gate: the recovery code must still be ACTIVE. Consuming it
      // and committing the verified evidence share one transaction, so a
      // concurrent submission of the same code cannot record duplicate
      // evidence and a consumed code can never be replayed. A failed guard
      // throws so the transaction rolls back: a stale version can never burn a
      // valid recovery code, and a consumed code can never be double-spent.
      const consumed = await transaction.recoveryCodeRecord.updateMany({
        where: {
          recoveryCodeId: command.consumedRecoveryCodeId.value,
          codeState: 'ACTIVE',
        },
        data: { codeState: 'CONSUMED', consumedAt: command.attempt.properties.attemptedAt },
      });
      if (consumed.count !== 1) {
        throw new OptimisticConcurrencyError('RecoveryCode');
      }

      const updated = await transaction.recoveryRequest.updateMany({
        where: {
          recoveryRequestId: command.recoveryRequestId.value,
          aggregateVersion: command.expectedRecoveryVersion.value,
        },
        data: recoveryRequestMapper.toPersistence(command.updatedRecoveryRequest),
      });
      if (updated.count !== 1) {
        throw new OptimisticConcurrencyError('RecoveryRequest');
      }

      await transaction.recoveryEvidenceRecord.create({
        data: recoveryEvidenceMapper.toPersistence(command.evidence),
      });
      await transaction.recoveryAttempt.create({
        data: recoveryAttemptMapper.toPersistence(command.attempt),
      });
      for (const transition of command.transitionsToAppend) {
        await transaction.recoveryStateTransition.create({
          data: recoveryStateTransitionMapper.toPersistence(transition),
        });
      }
    });
  }

  private async persistOwnedRecords(
    transaction: TransactionClient,
    changeSet: RecoveryAggregateChangeSet,
    upsert: boolean,
  ): Promise<void> {
    for (const entity of changeSet.evidence) {
      const data = recoveryEvidenceMapper.toPersistence(entity);
      if (upsert)
        await transaction.recoveryEvidenceRecord.upsert({
          where: { recoveryEvidenceId: entity.properties.recoveryEvidenceId.value },
          create: data,
          update: data,
        });
      else await transaction.recoveryEvidenceRecord.create({ data });
    }
    for (const entity of changeSet.notifications) {
      const data = recoveryNotificationMapper.toPersistence(entity);
      if (upsert)
        await transaction.recoveryNotificationRecord.upsert({
          where: { recoveryNotificationId: entity.properties.recoveryNotificationId.value },
          create: data,
          update: data,
        });
      else await transaction.recoveryNotificationRecord.create({ data });
    }
    for (const entity of changeSet.approvalsToAppend)
      await transaction.recoveryApprovalRecord.create({
        data: recoveryApprovalMapper.toPersistence(entity),
      });
    for (const entity of changeSet.attemptsToAppend)
      await transaction.recoveryAttempt.create({
        data: recoveryAttemptMapper.toPersistence(entity),
      });
    for (const entity of changeSet.transitionsToAppend)
      await transaction.recoveryStateTransition.create({
        data: recoveryStateTransitionMapper.toPersistence(entity),
      });
  }
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}
