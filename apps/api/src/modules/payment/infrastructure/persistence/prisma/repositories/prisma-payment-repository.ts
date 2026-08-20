import { Injectable } from '@nestjs/common';
import type { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import {
  assertVersionUpdated,
  type TransactionClient,
} from '../../../../../identity-authentication/infrastructure/persistence/prisma/repositories/repository-support';
import type { Payment } from '../../../../domain/entities/payment';
import type { PaymentAuditRecord } from '../../../../domain/entities/payment-audit-record';
import type { PaymentAttempt } from '../../../../domain/entities/payment-attempt';
import type { PaymentRefund } from '../../../../domain/entities/payment-refund';
import type { PaymentStateTransition } from '../../../../domain/entities/payment-state-transition';
import type {
  PaymentAggregateChangeSet,
  PaymentRepository,
} from '../../../../domain/ports/payment-repository.port';
import {
  paymentAuditRecordMapper,
  paymentAttemptMapper,
  paymentMapper,
  paymentRefundMapper,
  paymentStateTransitionMapper,
} from '../mappers/payment.mapper';

/**
 * WEMP-M09-PLAN-001 M09-M2. Prisma implementation of the Module 09 payment
 * aggregate repository. All mutations are atomic change sets guarded by
 * the payment aggregate version: save() applies only when the caller's
 * expected version is current, then persists the dependent aggregate changes
 * and appends the mandatory transition/audit records in the same transaction
 * — a stale version raises an OptimisticConcurrencyError and the whole
 * change set rolls back without mutating any state or leaving orphan records.
 *
 * Cross-module references (orderId, customerProfileId) are logical
 * UUIDv7 values — this repository never reads Module 06/08 storage (A-05).
 * Append-only safety: PaymentStateTransition and PaymentAuditRecord
 * are only ever created here — no update/delete surface exists for
 * historical records.
 */
@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(paymentId: UuidV7): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({
      where: { paymentId: paymentId.value },
    });
    return record === null ? null : paymentMapper.toDomain(record);
  }

  public async findByOrderId(orderId: UuidV7): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({
      where: { orderId: orderId.value },
    });
    return record === null ? null : paymentMapper.toDomain(record);
  }

  public async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    return record === null ? null : paymentMapper.toDomain(record);
  }

  public async findByProviderOrderId(providerOrderId: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findFirst({
      where: { providerOrderId },
    });
    return record === null ? null : paymentMapper.toDomain(record);
  }

  public async findByProviderPaymentId(providerPaymentId: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findFirst({
      where: { providerPaymentId },
    });
    return record === null ? null : paymentMapper.toDomain(record);
  }

  public async findAttempts(paymentId: UuidV7): Promise<readonly PaymentAttempt[]> {
    const records = await this.prisma.paymentAttempt.findMany({
      where: { paymentId: paymentId.value },
      orderBy: { attemptedAt: 'desc' },
    });
    return records.map((record) => paymentAttemptMapper.toDomain(record));
  }

  public async findTransitions(paymentId: UuidV7): Promise<readonly PaymentStateTransition[]> {
    const records = await this.prisma.paymentStateTransition.findMany({
      where: { paymentId: paymentId.value },
      orderBy: { transitionedAt: 'desc' },
    });
    return records.map((record) => paymentStateTransitionMapper.toDomain(record));
  }

  public async findAuditRecords(paymentId: UuidV7): Promise<readonly PaymentAuditRecord[]> {
    const records = await this.prisma.paymentAuditRecord.findMany({
      where: { paymentId: paymentId.value },
      orderBy: { occurredAt: 'desc' },
    });
    return records.map((record) => paymentAuditRecordMapper.toDomain(record));
  }

  public async findRefunds(paymentId: UuidV7): Promise<readonly PaymentRefund[]> {
    const records = await this.prisma.paymentRefund.findMany({
      where: { paymentId: paymentId.value },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => paymentRefundMapper.toDomain(record));
  }

  public async insert(changeSet: PaymentAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.payment.create({ data: paymentMapper.toPersistence(changeSet.payment) });

      for (const attempt of changeSet.attemptsToAppend) {
        await tx.paymentAttempt.create({ data: paymentAttemptMapper.toPersistence(attempt) });
      }

      for (const transition of changeSet.transitionsToAppend) {
        await tx.paymentStateTransition.create({
          data: paymentStateTransitionMapper.toPersistence(transition),
        });
      }

      for (const audit of changeSet.auditRecordsToAppend) {
        await tx.paymentAuditRecord.create({
          data: paymentAuditRecordMapper.toPersistence(audit),
        });
      }

      for (const refund of changeSet.refundsToAppend) {
        await tx.paymentRefund.create({ data: paymentRefundMapper.toPersistence(refund) });
      }
    });
  }

  public async save(
    changeSet: PaymentAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: TransactionClient) => {
      const paymentResult = await tx.payment.updateMany({
        where: {
          paymentId: changeSet.payment.properties.paymentId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: {
          state: changeSet.payment.properties.state,
          amountCents: changeSet.payment.properties.amountCents,
          currency: changeSet.payment.properties.currency,
          provider: changeSet.payment.properties.provider,
          providerOrderId: changeSet.payment.properties.providerOrderId,
          providerPaymentId: changeSet.payment.properties.providerPaymentId,
          aggregateVersion: changeSet.payment.properties.aggregateVersion.value,
          updatedAt: changeSet.payment.properties.updatedAt,
        },
      });
      assertVersionUpdated(paymentResult.count, 'Payment');

      for (const attempt of changeSet.attemptsToAppend) {
        await tx.paymentAttempt.create({ data: paymentAttemptMapper.toPersistence(attempt) });
      }

      for (const transition of changeSet.transitionsToAppend) {
        await tx.paymentStateTransition.create({
          data: paymentStateTransitionMapper.toPersistence(transition),
        });
      }

      for (const audit of changeSet.auditRecordsToAppend) {
        await tx.paymentAuditRecord.create({
          data: paymentAuditRecordMapper.toPersistence(audit),
        });
      }

      for (const refund of changeSet.refundsToAppend) {
        await tx.paymentRefund.create({ data: paymentRefundMapper.toPersistence(refund) });
      }
    });
  }
}
