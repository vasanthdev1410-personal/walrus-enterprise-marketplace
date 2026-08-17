import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import type { UuidV7GenerationPort } from '../../../../../identity-authentication/application/ports/application-runtime.port';
import { InventoryApplicationError } from '../../../../application/errors/inventory-application.error';
import type { RecordedThresholdConfigurationAdapter } from '../../../../infrastructure/configuration/recorded-threshold-configuration.adapter';
import { InventoryThresholdConfig } from '../../../../domain/value-objects/inventory-threshold-config';
import { PrismaInventoryConfigRepository } from './prisma-inventory-config.repository';

const ADMIN = new UuidV7('01913110-789a-7123-8123-000000000301');
const NOW = new Date('2026-08-15T12:00:00.000Z');

const RECORDED = new InventoryThresholdConfig({
  lowStockThreshold: 1,
  outOfStockThreshold: 0,
});

function recordedDefaults(): RecordedThresholdConfigurationAdapter {
  return {
    findThresholdConfig: jest.fn().mockResolvedValue(RECORDED),
  } as unknown as RecordedThresholdConfigurationAdapter;
}

function identifiers(): UuidV7GenerationPort {
  return {
    next: jest.fn().mockReturnValue({
      value: '01913110-789a-7123-8123-000000000302',
    }),
  };
}

function activeRow(configKey: string, configValue: string, aggregateVersion: number): unknown {
  return {
    configId: '01913110-789a-7123-8123-000000000303',
    configKey,
    configValue,
    state: 'ACTIVE',
    aggregateVersion,
    changedByIdentityId: ADMIN.value,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('PrismaInventoryConfigRepository (D-14, M05-M5)', () => {
  it('falls back to the recorded defaults at version 0 before an admin write', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]);
    const prisma = {
      inventoryConfigRecord: { findMany },
    } as unknown as PrismaService;

    const snapshot = await new PrismaInventoryConfigRepository(
      prisma,
      identifiers(),
      recordedDefaults(),
    ).findThresholdConfigSnapshot();

    expect(snapshot?.config.properties).toEqual({
      lowStockThreshold: 1,
      outOfStockThreshold: 0,
    });
    expect(snapshot?.version).toBe(0);
  });

  it('fails closed when the recorded defaults are unavailable', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]);
    const prisma = {
      inventoryConfigRecord: { findMany },
    } as unknown as PrismaService;
    const defaults = recordedDefaults();
    (defaults.findThresholdConfig as jest.Mock).mockResolvedValue(undefined);

    const snapshot = await new PrismaInventoryConfigRepository(
      prisma,
      identifiers(),
      defaults,
    ).findThresholdConfigSnapshot();

    expect(snapshot).toBeUndefined();
  });

  it('reads the stored admin-managed thresholds with the max version', async () => {
    const findMany = jest
      .fn<Promise<unknown[]>, [unknown]>()
      .mockResolvedValue([
        activeRow('LOW_STOCK_THRESHOLD', '3', 1),
        activeRow('OUT_OF_STOCK_THRESHOLD', '2', 1),
      ]);
    const prisma = {
      inventoryConfigRecord: { findMany },
    } as unknown as PrismaService;

    const snapshot = await new PrismaInventoryConfigRepository(
      prisma,
      identifiers(),
      recordedDefaults(),
    ).findThresholdConfigSnapshot();

    expect(snapshot?.config.properties).toEqual({
      lowStockThreshold: 3,
      outOfStockThreshold: 2,
    });
    expect(snapshot?.version).toBe(1);
  });

  it('fails closed on a partial stored row set (never falls back mid-write)', async () => {
    const findMany = jest
      .fn<Promise<unknown[]>, [unknown]>()
      .mockResolvedValue([activeRow('LOW_STOCK_THRESHOLD', '3', 1)]);
    const prisma = {
      inventoryConfigRecord: { findMany },
    } as unknown as PrismaService;

    const snapshot = await new PrismaInventoryConfigRepository(
      prisma,
      identifiers(),
      recordedDefaults(),
    ).findThresholdConfigSnapshot();

    expect(snapshot).toBeUndefined();
  });

  it('fails closed on an invalid stored value', async () => {
    const findMany = jest
      .fn<Promise<unknown[]>, [unknown]>()
      .mockResolvedValue([
        activeRow('LOW_STOCK_THRESHOLD', '1', 1),
        activeRow('OUT_OF_STOCK_THRESHOLD', 'not-a-number', 1),
      ]);
    const prisma = {
      inventoryConfigRecord: { findMany },
    } as unknown as PrismaService;

    const snapshot = await new PrismaInventoryConfigRepository(
      prisma,
      identifiers(),
      recordedDefaults(),
    ).findThresholdConfigSnapshot();

    expect(snapshot).toBeUndefined();
  });

  it('persists both rows in one transaction and bumps the version', async () => {
    const tx = {
      inventoryConfigRecord: {
        findMany: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]),
        upsert: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(activeRow('', '', 1)),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (t: unknown) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;

    const repository = new PrismaInventoryConfigRepository(
      prisma,
      identifiers(),
      recordedDefaults(),
    );
    const snapshot = await repository.saveThresholdConfig({
      lowStockThreshold: 3,
      outOfStockThreshold: 2,
      expectedVersion: 0,
      changedByIdentityId: ADMIN,
      now: NOW,
    });

    expect(snapshot.config.properties).toEqual({
      lowStockThreshold: 3,
      outOfStockThreshold: 2,
    });
    expect(snapshot.version).toBe(1);
    expect(tx.inventoryConfigRecord.upsert).toHaveBeenCalledTimes(2);
    const upsertCall = tx.inventoryConfigRecord.upsert.mock.calls[0]?.[0] as
      { create?: Record<string, unknown>; update?: Record<string, unknown> } | undefined;
    expect(upsertCall?.create).toMatchObject({
      configKey: 'LOW_STOCK_THRESHOLD',
      configValue: '3',
      aggregateVersion: 1,
      changedByIdentityId: ADMIN.value,
    });
    expect(upsertCall?.update).toMatchObject({
      configValue: '3',
      aggregateVersion: 1,
    });
  });

  it('rejects a stale expectedVersion with INVENTORY_STATE_CONFLICT', async () => {
    const tx = {
      inventoryConfigRecord: {
        findMany: jest
          .fn<Promise<unknown[]>, [unknown]>()
          .mockResolvedValue([
            activeRow('LOW_STOCK_THRESHOLD', '1', 1),
            activeRow('OUT_OF_STOCK_THRESHOLD', '0', 1),
          ]),
        upsert: jest.fn<Promise<unknown>, [unknown]>(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (t: unknown) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;

    const repository = new PrismaInventoryConfigRepository(
      prisma,
      identifiers(),
      recordedDefaults(),
    );

    await expect(
      repository.saveThresholdConfig({
        lowStockThreshold: 3,
        outOfStockThreshold: 2,
        expectedVersion: 0,
        changedByIdentityId: ADMIN,
        now: NOW,
      }),
    ).rejects.toThrow(new InventoryApplicationError('INVENTORY_STATE_CONFLICT'));
    expect(tx.inventoryConfigRecord.upsert).not.toHaveBeenCalled();
  });

  it('rejects an invalid threshold pair before touching storage', async () => {
    const transaction = jest.fn();
    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;

    const repository = new PrismaInventoryConfigRepository(
      prisma,
      identifiers(),
      recordedDefaults(),
    );

    await expect(
      repository.saveThresholdConfig({
        lowStockThreshold: 1,
        outOfStockThreshold: 5,
        expectedVersion: 0,
        changedByIdentityId: ADMIN,
        now: NOW,
      }),
    ).rejects.toThrow(new InventoryApplicationError('INVENTORY_VALIDATION_FAILED'));
    expect(transaction).not.toHaveBeenCalled();
  });
});
