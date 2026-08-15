import { Injectable } from '@nestjs/common';
import type { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { OptimisticConcurrencyError } from '../../../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import {
  assertVersionUpdated,
  type TransactionClient,
} from '../../../../../identity-authentication/infrastructure/persistence/prisma/repositories/repository-support';
import type { InventoryAuditRecord } from '../../../../domain/entities/inventory-audit-record';
import type { InventoryMovementRecord } from '../../../../domain/entities/inventory-movement-record';
import type { StockPool } from '../../../../domain/entities/stock-pool';
import type {
  InventoryAggregateChangeSet,
  InventoryEvidenceReadRepository,
  InventoryStockPoolRepository,
} from '../../../../domain/ports/inventory-repository.port';
import {
  inventoryAuditRecordMapper,
  inventoryMovementRecordMapper,
  stockPoolMapper,
} from '../mappers/inventory.mapper';

/**
 * WEMP-M05-PLAN-001 M05-M2/M05-M3. Prisma implementation of the Module 05
 * inventory repository (WEMP-M05-SPEC-001 §14). All quantity mutations
 * are atomic change sets guarded by the pool aggregate version (D-07):
 * mutate() acquires the PostgreSQL row lock (SELECT … FOR UPDATE) and runs
 * the whole load → validate → apply → write → commit path in one
 * transaction; a stale version or concurrent activation raises an
 * optimistic-concurrency error and the whole change set rolls back without
 * mutating any state. save()/insert() remain the version-guarded primitives.
 *
 * Cross-module references (skuId, sellerProfileId, actorIdentityId) are
 * logical UUIDv7 values — this repository never reads Module 04/03 storage
 * and no cross-module foreign keys exist (A-06).
 */
@Injectable()
export class PrismaInventoryRepository implements InventoryStockPoolRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findBySkuId(skuId: UuidV7): Promise<StockPool | null> {
    // The pool identity is (skuId, sellerProfileId) — one pool per SKU per
    // seller scope (D-01). A SKU belongs to exactly one seller organization,
    // so skuId alone resolves at most one pool.
    const record = await this.prisma.stockPool.findFirst({
      where: { skuId: skuId.value },
      orderBy: { createdAt: 'asc' },
    });
    return record === null ? null : stockPoolMapper.toDomain(record);
  }

  public async findBySeller(sellerProfileId: UuidV7): Promise<readonly StockPool[]> {
    const records = await this.prisma.stockPool.findMany({
      where: { sellerProfileId: sellerProfileId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => stockPoolMapper.toDomain(record));
  }

  public async findAll(): Promise<readonly StockPool[]> {
    const records = await this.prisma.stockPool.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => stockPoolMapper.toDomain(record));
  }

  /**
   * WEMP-M05-SPEC-001 §8 (decision D-07). Single-transaction mutation
   * path: PostgreSQL pessimistic row lock (`SELECT … FOR UPDATE`) on the
   * pool row, load, callback (policy apply + change-set build), then pool
   * write + appended evidence, all in one transaction — any failure rolls
   * back fully. The optimistic `aggregateVersion` guard remains a second
   * line of defense on the write (assertVersionUpdated). When no pool
   * exists the callback receives null and may build the activation change
   * set (D-15); the `@@unique([skuId, sellerProfileId])` constraint fails
   * closed on a concurrent activation (mapped non-disclosingly).
   */
  public async mutate(
    skuId: UuidV7,
    mutate: (pool: StockPool | null) => Promise<InventoryAggregateChangeSet>,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      // D-07 pessimistic row lock — the pool row for this SKU is locked for
      // the whole transaction so concurrent mutations serialize on the row.
      await transaction.$queryRaw`
        SELECT stock_pool_id
        FROM inventory_stock_pools
        WHERE sku_id = ${skuId.value}
        FOR UPDATE
      `;
      const record = await transaction.stockPool.findFirst({
        where: { skuId: skuId.value },
        orderBy: { createdAt: 'asc' },
      });
      const pool = record === null ? null : stockPoolMapper.toDomain(record);
      const changeSet = await mutate(pool);
      if (pool === null) {
        try {
          await transaction.stockPool.create({
            data: stockPoolMapper.toPersistence(changeSet.pool),
          });
        } catch (error) {
          // Concurrent activation: the unique (skuId, sellerProfileId) pool
          // constraint rejects the second insert. Fail closed, non-disclosing.
          if (isUniqueViolation(error)) {
            throw new OptimisticConcurrencyError('StockPool');
          }
          throw error;
        }
      } else {
        const updated = await transaction.stockPool.updateMany({
          where: {
            stockPoolId: pool.properties.stockPoolId.value,
            aggregateVersion: pool.properties.aggregateVersion.value,
          },
          data: stockPoolMapper.toPersistence(changeSet.pool),
        });
        assertVersionUpdated(updated.count, 'StockPool');
      }
      await this.appendEvidence(transaction, changeSet);
    });
  }

  public async insert(changeSet: InventoryAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.stockPool.create({
        data: stockPoolMapper.toPersistence(changeSet.pool),
      });
      await this.appendEvidence(transaction, changeSet);
    });
  }

  public async save(
    changeSet: InventoryAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.stockPool.updateMany({
        where: {
          stockPoolId: changeSet.pool.properties.stockPoolId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: stockPoolMapper.toPersistence(changeSet.pool),
      });
      assertVersionUpdated(updated.count, 'StockPool');
      await this.appendEvidence(transaction, changeSet);
    });
  }

  private async appendEvidence(
    transaction: TransactionClient,
    changeSet: InventoryAggregateChangeSet,
  ): Promise<void> {
    // WEMP-M05-SPEC-001 §10: append-only ledger — never updated, never deleted.
    for (const entity of changeSet.movementsToAppend) {
      await transaction.inventoryMovementRecord.create({
        data: inventoryMovementRecordMapper.toPersistence(entity),
      });
    }
    // WEMP-M05-SPEC-001 §10: append-only business audit committed atomically.
    for (const entity of changeSet.auditRecordsToAppend) {
      await transaction.inventoryAuditRecord.create({
        data: inventoryAuditRecordMapper.toPersistence(entity),
      });
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

export class PrismaInventoryEvidenceReadRepository implements InventoryEvidenceReadRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findMovements(stockPoolId: UuidV7): Promise<readonly InventoryMovementRecord[]> {
    const records = await this.prisma.inventoryMovementRecord.findMany({
      where: { stockPoolId: stockPoolId.value },
      orderBy: { occurredAt: 'asc' },
    });
    return records.map((record) => inventoryMovementRecordMapper.toDomain(record));
  }

  public async findAuditRecords(stockPoolId: UuidV7): Promise<readonly InventoryAuditRecord[]> {
    const records = await this.prisma.inventoryAuditRecord.findMany({
      where: { stockPoolId: stockPoolId.value },
      orderBy: { occurredAt: 'asc' },
    });
    return records.map((record) => inventoryAuditRecordMapper.toDomain(record));
  }
}
