import { Injectable } from '@nestjs/common';
import type { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import {
  assertVersionUpdated,
  type TransactionClient,
} from '../../../../../identity-authentication/infrastructure/persistence/prisma/repositories/repository-support';
import type { Order } from '../../../../domain/entities/order';
import type { OrderAuditRecord } from '../../../../domain/entities/order-audit-record';
import type { OrderLine } from '../../../../domain/entities/order-line';
import type { OrderStateTransition } from '../../../../domain/entities/order-state-transition';
import type {
  OrderAggregateChangeSet,
  OrderRepository,
} from '../../../../domain/ports/order-repository.port';
import {
  orderAuditRecordMapper,
  orderLineMapper,
  orderMapper,
  orderStateTransitionMapper,
} from '../mappers/order.mapper';

/**
 * WEMP-M08-PLAN-001 M08-M2. Prisma implementation of the Module 08 order
 * aggregate repository. All mutations are atomic change sets guarded by
 * the order aggregate version (D-11): save() applies only when the caller's
 * expected version is current, then persists the dependent aggregate changes
 * and appends the mandatory transition/audit records in the same transaction
 * — a stale version raises an OptimisticConcurrencyError and the whole
 * change set rolls back without mutating any state or leaving orphan records.
 *
 * Cross-module references (customerProfileId, skuId, cartId) are logical
 * UUIDv7 values — this repository never reads Module 04/05/06/07 storage (A-05).
 * Append-only safety (D-01/D-07): OrderStateTransition and OrderAuditRecord
 * are only ever created here — no update/delete surface exists for historical
 * records.
 */
@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(orderId: UuidV7): Promise<Order | null> {
    const record = await this.prisma.order.findUnique({
      where: { orderId: orderId.value },
    });
    return record === null ? null : orderMapper.toDomain(record);
  }

  public async findPendingByCustomerProfileId(customerProfileId: UuidV7): Promise<Order | null> {
    const record = await this.prisma.order.findFirst({
      where: {
        customerProfileId: customerProfileId.value,
        state: 'PENDING',
      },
    });
    return record === null ? null : orderMapper.toDomain(record);
  }

  public async findLines(orderId: UuidV7): Promise<readonly OrderLine[]> {
    const records = await this.prisma.orderLine.findMany({
      where: { orderId: orderId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => orderLineMapper.toDomain(record));
  }

  public async findTransitions(orderId: UuidV7): Promise<readonly OrderStateTransition[]> {
    const records = await this.prisma.orderStateTransition.findMany({
      where: { orderId: orderId.value },
      orderBy: { transitionedAt: 'desc' },
    });
    return records.map((record) => orderStateTransitionMapper.toDomain(record));
  }

  public async findAuditRecords(orderId: UuidV7): Promise<readonly OrderAuditRecord[]> {
    const records = await this.prisma.orderAuditRecord.findMany({
      where: { orderId: orderId.value },
      orderBy: { occurredAt: 'desc' },
    });
    return records.map((record) => orderAuditRecordMapper.toDomain(record));
  }

  public async insert(changeSet: OrderAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.order.create({ data: orderMapper.toPersistence(changeSet.order) });

      for (const line of changeSet.linesToAppend) {
        await tx.orderLine.create({ data: orderLineMapper.toPersistence(line) });
      }

      for (const transition of changeSet.transitionsToAppend) {
        await tx.orderStateTransition.create({
          data: orderStateTransitionMapper.toPersistence(transition),
        });
      }

      for (const audit of changeSet.auditRecordsToAppend) {
        await tx.orderAuditRecord.create({
          data: orderAuditRecordMapper.toPersistence(audit),
        });
      }
    });
  }

  public async save(
    changeSet: OrderAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: TransactionClient) => {
      const orderResult = await tx.order.updateMany({
        where: {
          orderId: changeSet.order.properties.orderId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: {
          state: changeSet.order.properties.state,
          totalLines: changeSet.order.properties.totalLines,
          totalItems: changeSet.order.properties.totalItems,
          subtotalAmountCents: changeSet.order.properties.subtotalAmountCents,
          subtotalCurrency: changeSet.order.properties.subtotalCurrency,
          aggregateVersion: changeSet.order.properties.aggregateVersion.value,
          updatedAt: changeSet.order.properties.updatedAt,
        },
      });
      assertVersionUpdated(orderResult.count, 'Order');

      for (const line of changeSet.linesToAppend) {
        await tx.orderLine.create({ data: orderLineMapper.toPersistence(line) });
      }

      for (const transition of changeSet.transitionsToAppend) {
        await tx.orderStateTransition.create({
          data: orderStateTransitionMapper.toPersistence(transition),
        });
      }

      for (const audit of changeSet.auditRecordsToAppend) {
        await tx.orderAuditRecord.create({
          data: orderAuditRecordMapper.toPersistence(audit),
        });
      }
    });
  }
}
