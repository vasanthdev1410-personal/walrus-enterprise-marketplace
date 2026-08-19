import { Injectable } from '@nestjs/common';
import type { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import {
  assertVersionUpdated,
  type TransactionClient,
} from '../../../../../identity-authentication/infrastructure/persistence/prisma/repositories/repository-support';
import type { Cart } from '../../../../domain/entities/cart';
import type { CartAuditRecord } from '../../../../domain/entities/cart-audit-record';
import type { CartLine } from '../../../../domain/entities/cart-line';
import type { CartStateTransition } from '../../../../domain/entities/cart-state-transition';
import type {
  CartAggregateChangeSet,
  CartRepository,
} from '../../../../domain/ports/cart-repository.port';
import {
  cartAuditRecordMapper,
  cartLineMapper,
  cartMapper,
  cartStateTransitionMapper,
} from '../mappers/cart.mapper';

/**
 * WEMP-M07-PLAN-001 M07-M2. Prisma implementation of the Module 07 cart
 * aggregate repository. All mutations are atomic change sets guarded by
 * the cart aggregate version (D-16): save() applies only when the caller's
 * expected version is current, then persists the dependent aggregate changes
 * and appends the mandatory transition/audit records in the same transaction
 * — a stale version raises an OptimisticConcurrencyError and the whole
 * change set rolls back without mutating any state or leaving orphan records.
 *
 * Cross-module references (customerProfileId, skuId, productId) are logical
 * UUIDv7 values — this repository never reads Module 04/05/06 storage (A-05).
 * Append-only safety (D-07/D-11): CartStateTransition and CartAuditRecord
 * are only ever created here — no update/delete surface exists for historical
 * records.
 */
@Injectable()
export class PrismaCartRepository implements CartRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findActiveByCustomerProfileId(customerProfileId: UuidV7): Promise<Cart | null> {
    const record = await this.prisma.cart.findUnique({
      where: { customerProfileId: customerProfileId.value },
    });
    return record === null ? null : cartMapper.toDomain(record);
  }

  public async findById(cartId: UuidV7): Promise<Cart | null> {
    const record = await this.prisma.cart.findUnique({
      where: { cartId: cartId.value },
    });
    return record === null ? null : cartMapper.toDomain(record);
  }

  public async findLines(cartId: UuidV7): Promise<readonly CartLine[]> {
    const records = await this.prisma.cartLine.findMany({
      where: { cartId: cartId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => cartLineMapper.toDomain(record));
  }

  public async findTransitions(cartId: UuidV7): Promise<readonly CartStateTransition[]> {
    const records = await this.prisma.cartStateTransition.findMany({
      where: { cartId: cartId.value },
      orderBy: { transitionedAt: 'desc' },
    });
    return records.map((record) => cartStateTransitionMapper.toDomain(record));
  }

  public async findAuditRecords(cartId: UuidV7): Promise<readonly CartAuditRecord[]> {
    const records = await this.prisma.cartAuditRecord.findMany({
      where: { cartId: cartId.value },
      orderBy: { occurredAt: 'desc' },
    });
    return records.map((record) => cartAuditRecordMapper.toDomain(record));
  }

  public async insert(changeSet: CartAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.cart.create({ data: cartMapper.toPersistence(changeSet.cart) });

      for (const line of changeSet.linesToAppend) {
        await tx.cartLine.create({ data: cartLineMapper.toPersistence(line) });
      }

      for (const transition of changeSet.transitionsToAppend) {
        await tx.cartStateTransition.create({
          data: cartStateTransitionMapper.toPersistence(transition),
        });
      }

      for (const audit of changeSet.auditRecordsToAppend) {
        await tx.cartAuditRecord.create({
          data: cartAuditRecordMapper.toPersistence(audit),
        });
      }
    });
  }

  public async save(
    changeSet: CartAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: TransactionClient) => {
      const cartResult = await tx.cart.updateMany({
        where: {
          cartId: changeSet.cart.properties.cartId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: {
          state: changeSet.cart.properties.state,
          totalLines: changeSet.cart.properties.totalLines,
          totalItems: changeSet.cart.properties.totalItems,
          aggregateVersion: changeSet.cart.properties.aggregateVersion.value,
          updatedAt: changeSet.cart.properties.updatedAt,
          expiresAt: changeSet.cart.properties.expiresAt ?? null,
        },
      });
      assertVersionUpdated(cartResult.count, 'Cart');

      for (const line of changeSet.linesToAppend) {
        await tx.cartLine.create({ data: cartLineMapper.toPersistence(line) });
      }

      for (const line of changeSet.linesToUpdate) {
        await tx.cartLine.updateMany({
          where: { cartLineId: line.properties.cartLineId.value },
          data: {
            quantity: line.properties.quantity.value,
            unitPriceAmount: line.properties.unitPrice.cents,
            unitPriceCurrency: line.properties.unitPrice.currencyCode,
            snapshotTaxIncluded: line.properties.snapshotTaxIncluded,
            productUnavailable: line.properties.productUnavailable,
            aggregateVersion: line.properties.aggregateVersion.value,
            updatedAt: line.properties.updatedAt,
          },
        });
      }

      for (const lineId of changeSet.linesToRemove) {
        await tx.cartLine.deleteMany({
          where: { cartLineId: lineId.value },
        });
      }

      for (const transition of changeSet.transitionsToAppend) {
        await tx.cartStateTransition.create({
          data: cartStateTransitionMapper.toPersistence(transition),
        });
      }

      for (const audit of changeSet.auditRecordsToAppend) {
        await tx.cartAuditRecord.create({
          data: cartAuditRecordMapper.toPersistence(audit),
        });
      }
    });
  }
}
