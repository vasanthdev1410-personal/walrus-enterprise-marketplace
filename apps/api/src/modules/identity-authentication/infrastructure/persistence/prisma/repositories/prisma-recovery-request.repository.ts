import { Injectable } from '@nestjs/common';
import type { RecoveryRequest } from '../../../../domain/recovery/entities/recovery-request';
import type {
  RecoveryAggregateChangeSet,
  RecoveryRequestRepository,
} from '../../../../domain/recovery/repositories/recovery-request-repository';
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
