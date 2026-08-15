import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { StockPool } from '../../domain/entities/stock-pool';
import { InventoryStockPolicy } from '../../domain/policy/inventory-stock-policy';
import type {
  InventoryAggregateChangeSet,
  InventoryStockPoolRepository,
} from '../../domain/ports/inventory-repository.port';
import { InventoryQuantity } from '../../domain/value-objects/inventory-quantity';
import { InventoryReservationService } from './inventory-reservation.service';

const SKU = new UuidV7('01900000-0000-7000-8000-000000000005');
const NOW = new Date('2026-08-15T12:00:00.000Z');

function pool(onHand = 100, reserved = 10, version = 1): StockPool {
  return new StockPool({
    stockPoolId: new UuidV7('01900000-0000-7000-8000-000000000010'),
    skuId: SKU,
    sellerProfileId: new UuidV7('01900000-0000-7000-8000-000000000003'),
    onHand: new InventoryQuantity(onHand),
    reserved: new InventoryQuantity(reserved),
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function createService(pool: StockPool | null): {
  service: InventoryReservationService;
  capturedPools: StockPool[];
} {
  const capturedPools: StockPool[] = [];
  const repository: InventoryStockPoolRepository = {
    mutate: jest.fn(
      async (
        _skuId: UuidV7,
        mutate: (
          p: StockPool | null,
        ) => InventoryAggregateChangeSet | Promise<InventoryAggregateChangeSet>,
      ) => {
        const changeSet = await mutate(pool);
        capturedPools.push(changeSet.pool);
      },
    ),
    ...({} as Omit<InventoryStockPoolRepository, 'mutate'>),
  };
  const service = new InventoryReservationService(
    repository,
    new InventoryStockPolicy(),
    { now: () => NOW },
    { next: () => new UuidV7('01900000-0000-7000-8000-000000000020') },
    {
      execute: async <T>(execution: { execute: () => Promise<T> }) => execution.execute(),
    } as never,
  );
  return { service, capturedPools };
}

describe('InventoryReservationService (M05-M3, D-06 domain-level reserve/release)', () => {
  it('reserves within available and returns the updated available quantity', async () => {
    const { service, capturedPools } = createService(pool(100, 10, 1));
    const result = await service.reserve({ skuId: SKU, quantity: 20 });
    expect(result.outcome).toBe('RESERVED');
    if (result.outcome === 'RESERVED') {
      expect(result.availableQuantity).toBe(70);
    }
    expect(capturedPools[0]?.properties.reserved.value).toBe(30);
    expect(capturedPools[0]?.properties.aggregateVersion.value).toBe(2);
  });

  it('denies a reserve exceeding available (D-02/D-06)', async () => {
    const { service } = createService(pool(100, 10, 1));
    const result = await service.reserve({ skuId: SKU, quantity: 91 });
    expect(result.outcome).toBe('DENIED');
  });

  it('denies a reserve on a pool that does not exist (fail closed)', async () => {
    const { service } = createService(null);
    const result = await service.reserve({ skuId: SKU, quantity: 5 });
    expect(result.outcome).toBe('DENIED');
  });

  it('denies an invalid (non-positive) quantity (D-08)', async () => {
    const { service } = createService(pool());
    const result = await service.reserve({ skuId: SKU, quantity: 0 });
    expect(result.outcome).toBe('DENIED');
  });

  it('releases within reserved and never goes below zero (D-06)', async () => {
    const { service, capturedPools } = createService(pool(100, 10, 1));
    const result = await service.release({ skuId: SKU, quantity: 4 });
    expect(result.outcome).toBe('RESERVED');
    if (result.outcome === 'RESERVED') {
      expect(result.availableQuantity).toBe(94);
    }
    expect(capturedPools[0]?.properties.reserved.value).toBe(6);
  });

  it('denies a release exceeding reserved (D-06)', async () => {
    const { service } = createService(pool(100, 10, 1));
    const result = await service.release({ skuId: SKU, quantity: 11 });
    expect(result.outcome).toBe('DENIED');
  });

  it('appends no movement or audit records (D-06 — port-only, no reservation record)', async () => {
    let changeSetSeen = false;
    const repository: InventoryStockPoolRepository = {
      mutate: jest.fn(
        async (
          _skuId: UuidV7,
          mutate: (
            p: StockPool | null,
          ) => InventoryAggregateChangeSet | Promise<InventoryAggregateChangeSet>,
        ) => {
          const changeSet = await mutate(pool());
          changeSetSeen = true;
          expect(changeSet.movementsToAppend).toHaveLength(0);
          expect(changeSet.auditRecordsToAppend).toHaveLength(0);
        },
      ),
      ...({} as Omit<InventoryStockPoolRepository, 'mutate'>),
    };
    const service = new InventoryReservationService(
      repository,
      new InventoryStockPolicy(),
      { now: () => NOW },
      { next: () => new UuidV7('01900000-0000-7000-8000-000000000020') },
      {
        execute: async <T>(execution: { execute: () => Promise<T> }) => execution.execute(),
      } as never,
    );
    await service.reserve({ skuId: SKU, quantity: 5 });
    expect(changeSetSeen).toBe(true);
  });

  it('resolves internal errors to FAILED (non-disclosing)', async () => {
    const repository: InventoryStockPoolRepository = {
      mutate: jest.fn(
        async (
          _skuId: UuidV7,
          mutate: (
            p: StockPool | null,
          ) => InventoryAggregateChangeSet | Promise<InventoryAggregateChangeSet>,
        ) => {
          await mutate(pool());
        },
      ),
      ...({} as Omit<InventoryStockPoolRepository, 'mutate'>),
    };
    const service = new InventoryReservationService(
      repository,
      {
        reserve: () => {
          throw new Error('boom');
        },
      } as unknown as InventoryStockPolicy,
      { now: () => NOW },
      { next: () => new UuidV7('01900000-0000-7000-8000-000000000020') },
      {
        execute: async <T>(execution: { execute: () => Promise<T> }) => execution.execute(),
      } as never,
    );
    const result = await service.reserve({ skuId: SKU, quantity: 5 });
    expect(result.outcome).toBe('FAILED');
  });
});
