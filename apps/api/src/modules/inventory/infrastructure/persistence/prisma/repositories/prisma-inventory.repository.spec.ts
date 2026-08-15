import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { OptimisticConcurrencyError } from '../../../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { InventoryMovementRecord } from '../../../../domain/entities/inventory-movement-record';
import { StockPool } from '../../../../domain/entities/stock-pool';
import type { InventoryAggregateChangeSet } from '../../../../domain/ports/inventory-repository.port';
import { InventoryQuantity } from '../../../../domain/value-objects/inventory-quantity';
import {
  PrismaInventoryEvidenceReadRepository,
  PrismaInventoryRepository,
} from './prisma-inventory.repository';

const POOL_ID = new UuidV7('01913110-789a-7123-8123-000000000201');
const SKU_ID = new UuidV7('01913110-789a-7123-8123-000000000202');
const SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000203');
const ACTOR_ID = new UuidV7('01913110-789a-7123-8123-000000000204');
const MOVEMENT_ID = new UuidV7('01913110-789a-7123-8123-000000000205');
const NOW = new Date('2026-08-14T00:00:00.000Z');

function pool(onHand = 100, reserved = 20, version = 1): StockPool {
  return new StockPool({
    stockPoolId: POOL_ID,
    skuId: SKU_ID,
    sellerProfileId: SELLER_ID,
    onHand: new InventoryQuantity(onHand),
    reserved: new InventoryQuantity(reserved),
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function movement(): InventoryMovementRecord {
  return new InventoryMovementRecord({
    movementId: MOVEMENT_ID,
    stockPoolId: POOL_ID,
    movementType: 'STOCK_IN',
    delta: 10,
    resultingOnHand: 110,
    resultingReserved: 20,
    actorIdentityId: ACTOR_ID,
    aggregateVersion: new AggregateVersion(2),
    occurredAt: NOW,
    createdAt: NOW,
  });
}

function changeSet(poolValue: StockPool = pool()): InventoryAggregateChangeSet {
  return { pool: poolValue, movementsToAppend: [movement()], auditRecordsToAppend: [] };
}

describe('PrismaInventoryRepository (M05-M2 persistence, D-07/D-09)', () => {
  it('finds a pool by SKU', async () => {
    const findFirst = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
      stockPoolId: POOL_ID.value,
      skuId: SKU_ID.value,
      sellerProfileId: SELLER_ID.value,
      onHand: 100,
      reserved: 20,
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const prisma = { stockPool: { findFirst } } as unknown as PrismaService;

    const result = await new PrismaInventoryRepository(prisma).findBySkuId(SKU_ID);

    expect(findFirst).toHaveBeenCalledWith({
      where: { skuId: SKU_ID.value },
      orderBy: { createdAt: 'asc' },
    });
    expect(result?.properties.onHand.value).toBe(100);
    expect(result?.available.value).toBe(80);
  });

  it('returns null when no pool exists', async () => {
    const prisma = {
      stockPool: { findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const result = await new PrismaInventoryRepository(prisma).findBySkuId(SKU_ID);
    expect(result).toBeNull();
  });

  it('lists all pools for admin inspection', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        stockPoolId: POOL_ID.value,
        skuId: SKU_ID.value,
        sellerProfileId: SELLER_ID.value,
        onHand: 100,
        reserved: 20,
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const prisma = { stockPool: { findMany } } as unknown as PrismaService;

    const pools = await new PrismaInventoryRepository(prisma).findAll();

    expect(findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
    expect(pools[0]?.properties.skuId).toEqual(SKU_ID);
  });

  it('lists pools scoped to a seller organization', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        stockPoolId: POOL_ID.value,
        skuId: SKU_ID.value,
        sellerProfileId: SELLER_ID.value,
        onHand: 100,
        reserved: 20,
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const prisma = { stockPool: { findMany } } as unknown as PrismaService;

    const pools = await new PrismaInventoryRepository(prisma).findBySeller(SELLER_ID);

    expect(findMany).toHaveBeenCalledWith({
      where: { sellerProfileId: SELLER_ID.value },
      orderBy: { createdAt: 'asc' },
    });
    expect(pools[0]?.properties.sellerProfileId).toEqual(SELLER_ID);
  });

  it('saves a versioned change set when the expected version is current', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const createMovement = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const transaction = {
      stockPool: { updateMany },
      inventoryMovementRecord: { create: createMovement },
      inventoryAuditRecord: { create: jest.fn() },
    };
    const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
      operation(transaction as never),
    );
    const repository = new PrismaInventoryRepository({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    const next = pool(110, 20, 2);
    await repository.save(changeSet(next), new AggregateVersion(1));

    const update = updateMany.mock.calls[0]?.[0] as
      { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
    expect(update?.where).toMatchObject({
      stockPoolId: POOL_ID.value,
      aggregateVersion: 1,
    });
    expect(update?.data).toMatchObject({ onHand: 110, aggregateVersion: 2 });
    expect(createMovement).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale version and rolls back without appending evidence', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 0 });
    const createMovement = jest.fn();
    const transaction = {
      stockPool: { updateMany },
      inventoryMovementRecord: { create: createMovement },
      inventoryAuditRecord: { create: jest.fn() },
    };
    const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
      operation(transaction as never),
    );
    const repository = new PrismaInventoryRepository({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    await expect(
      repository.save(changeSet(pool(110, 20, 2)), new AggregateVersion(1)),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
    expect(createMovement).not.toHaveBeenCalled();
  });

  describe('mutate (D-07 single-transaction row-locked path)', () => {
    function rowLockedFixture(
      overrides: {
        lockedRowExists?: boolean;
        storedVersion?: number;
        createThrows?: boolean;
      } = {},
    ): {
      repository: PrismaInventoryRepository;
      queryRaw: jest.Mock<Promise<unknown[]>, [TemplateStringsArray, string]>;
      findFirst: jest.Mock<Promise<unknown>, [unknown]>;
      updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
      create: jest.Mock<Promise<unknown>, [unknown]>;
      createMovement: jest.Mock<Promise<unknown>, [unknown]>;
      createAudit: jest.Mock<Promise<unknown>, [unknown]>;
    } {
      const lockedRowExists = overrides.lockedRowExists ?? true;
      const storedVersion = overrides.storedVersion ?? 1;
      const queryRaw = jest
        .fn<Promise<unknown[]>, [TemplateStringsArray, string]>()
        .mockResolvedValue(lockedRowExists ? [{ stockPoolId: POOL_ID.value }] : []);
      const findFirst = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(
        lockedRowExists
          ? {
              stockPoolId: POOL_ID.value,
              skuId: SKU_ID.value,
              sellerProfileId: SELLER_ID.value,
              onHand: 100,
              reserved: 20,
              aggregateVersion: storedVersion,
              createdAt: NOW,
              updatedAt: NOW,
            }
          : null,
      );
      const updateMany = jest
        .fn<Promise<{ count: number }>, [unknown]>()
        .mockResolvedValue({ count: 1 });
      const create = jest.fn<Promise<unknown>, [unknown]>().mockImplementation(() => {
        if (overrides.createThrows === true) {
          return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
        }
        return Promise.resolve(undefined);
      });
      const createMovement = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
      const createAudit = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
      const transaction = {
        $queryRaw: queryRaw,
        stockPool: { findFirst, updateMany, create },
        inventoryMovementRecord: { create: createMovement },
        inventoryAuditRecord: { create: createAudit },
      };
      const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      );
      const repository = new PrismaInventoryRepository({
        $transaction: runTransaction,
      } as unknown as PrismaService);
      return {
        repository,
        queryRaw,
        findFirst,
        updateMany,
        create,
        createMovement,
        createAudit,
      };
    }

    it('locks the pool row with SELECT … FOR UPDATE before mutating', async () => {
      const { repository, queryRaw } = rowLockedFixture();
      await repository.mutate(SKU_ID, () => Promise.resolve(changeSet(pool(110, 20, 2))));
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(String(queryRaw.mock.calls[0]?.[0])).toContain('FOR UPDATE');
      expect(String(queryRaw.mock.calls[0]?.[0])).toContain('inventory_stock_pools');
    });

    it('commits the pool write and appended evidence in the same transaction', async () => {
      const { repository, updateMany, createMovement } = rowLockedFixture();
      await repository.mutate(SKU_ID, () => Promise.resolve(changeSet(pool(110, 20, 2))));
      const update = updateMany.mock.calls[0]?.[0] as
        { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
      expect(update?.where).toMatchObject({
        stockPoolId: POOL_ID.value,
        aggregateVersion: 1,
      });
      expect(update?.data).toMatchObject({ onHand: 110, aggregateVersion: 2 });
      expect(createMovement).toHaveBeenCalledTimes(1);
    });

    it('inserts the pool on activation (no row to lock, D-15)', async () => {
      const { repository, create, findFirst } = rowLockedFixture({ lockedRowExists: false });
      await repository.mutate(SKU_ID, () => Promise.resolve(changeSet(pool(50, 0, 2))));
      expect(findFirst).toHaveBeenCalled();
      expect(create).toHaveBeenCalledTimes(1);
      const createData = create.mock.calls[0]?.[0] as
        { data?: Record<string, unknown> } | undefined;
      expect(createData?.data).toMatchObject({ skuId: SKU_ID.value, onHand: 50 });
    });

    it('maps a concurrent-activation unique violation to an optimistic-concurrency error', async () => {
      const { repository } = rowLockedFixture({
        lockedRowExists: false,
        createThrows: true,
      });
      await expect(
        repository.mutate(SKU_ID, () => Promise.resolve(changeSet(pool(50, 0, 2)))),
      ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
    });

    it('rolls back and propagates a mutation-callback failure without writing', async () => {
      const { repository, createMovement } = rowLockedFixture();
      await expect(
        repository.mutate(SKU_ID, () => Promise.reject(new Error('policy denied'))),
      ).rejects.toThrow('policy denied');
      expect(createMovement).not.toHaveBeenCalled();
    });
  });
});

describe('PrismaInventoryEvidenceReadRepository (append-only reads, D-09)', () => {
  it('reads the movement ledger in recorded order', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        movementId: MOVEMENT_ID.value,
        stockPoolId: POOL_ID.value,
        movementType: 'STOCK_IN',
        delta: 10,
        resultingOnHand: 110,
        resultingReserved: 20,
        actorIdentityId: ACTOR_ID.value,
        reasonReference: null,
        correlationId: null,
        causationId: null,
        aggregateVersion: 2,
        occurredAt: NOW,
        createdAt: NOW,
      },
    ]);
    const prisma = {
      inventoryMovementRecord: { findMany },
    } as unknown as PrismaService;

    const movements = await new PrismaInventoryEvidenceReadRepository(prisma).findMovements(
      POOL_ID,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { stockPoolId: POOL_ID.value },
      orderBy: { occurredAt: 'asc' },
    });
    expect(movements[0]?.properties.delta).toBe(10);
  });

  it('reads audit records in recorded order', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        auditEventId: new UuidV7('01913110-789a-7123-8123-000000000206').value,
        stockPoolId: POOL_ID.value,
        eventType: 'POOL_ACTIVATED',
        actorIdentityId: ACTOR_ID.value,
        correlationId: null,
        evidenceDigest: null,
        occurredAt: NOW,
        createdAt: NOW,
      },
    ]);
    const prisma = {
      inventoryAuditRecord: { findMany },
    } as unknown as PrismaService;

    const audits = await new PrismaInventoryEvidenceReadRepository(prisma).findAuditRecords(
      POOL_ID,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { stockPoolId: POOL_ID.value },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audits[0]?.properties.eventType).toBe('POOL_ACTIVATED');
  });
});
