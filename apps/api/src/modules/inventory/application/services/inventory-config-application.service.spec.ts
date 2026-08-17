import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { InventoryThresholdConfig } from '../../domain/value-objects/inventory-threshold-config';
import { InventoryApplicationError } from '../errors/inventory-application.error';
import { InventoryConfigApplicationService } from './inventory-config-application.service';

const ADMIN = new UuidV7('01900000-0000-7000-8000-000000000007');

const CONFIG = new InventoryThresholdConfig({
  lowStockThreshold: 1,
  outOfStockThreshold: 0,
});

interface Dependencies {
  config: {
    findThresholdConfig: jest.Mock;
    findThresholdConfigSnapshot: jest.Mock;
    saveThresholdConfig: jest.Mock;
  };
  adminAuthorization: { isGranted: jest.Mock };
  rateLimiter: { consume: jest.Mock };
  idempotency: { execute: jest.Mock };
}

function createService(overrides: Partial<Dependencies> = {}): {
  service: InventoryConfigApplicationService;
  deps: Dependencies;
} {
  const deps: Dependencies = {
    config: {
      findThresholdConfig: jest.fn().mockResolvedValue(CONFIG),
      findThresholdConfigSnapshot: jest.fn().mockResolvedValue({ config: CONFIG, version: 0 }),
      saveThresholdConfig: jest.fn().mockResolvedValue({ config: CONFIG, version: 1 }),
    },
    adminAuthorization: {
      isGranted: jest.fn().mockResolvedValue(true),
    },
    rateLimiter: {
      consume: jest.fn().mockResolvedValue({ allowed: true }),
    },
    idempotency: {
      execute: jest
        .fn()
        .mockImplementation((command: { execute: () => Promise<unknown> }) => command.execute()),
    },
    ...overrides,
  };
  return {
    service: new InventoryConfigApplicationService(
      deps.config,
      deps.adminAuthorization,
      deps.rateLimiter,
      deps.idempotency as never,
    ),
    deps,
  };
}

describe('InventoryConfigApplicationService (D-14, M05-M5)', () => {
  it('reads the threshold configuration for an admin with the audit grant', async () => {
    const { service, deps } = createService();
    const snapshot = await service.getThresholdConfig(ADMIN);

    expect(snapshot.config.properties).toEqual({
      lowStockThreshold: 1,
      outOfStockThreshold: 0,
    });
    expect(snapshot.version).toBe(0);
    expect(deps.adminAuthorization.isGranted).toHaveBeenCalledWith(ADMIN, 'inventory.audit.view');
  });

  it('fails closed when the caller lacks the audit grant', async () => {
    const { service, deps } = createService();
    deps.adminAuthorization.isGranted.mockResolvedValue(false);

    await expect(service.getThresholdConfig(ADMIN)).rejects.toThrow(
      new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED'),
    );
  });

  it('fails closed when the caller is rate limited (D-11: 50/hour)', async () => {
    const { service, deps } = createService();
    deps.rateLimiter.consume.mockResolvedValue({ allowed: false });

    await expect(service.getThresholdConfig(ADMIN)).rejects.toThrow(
      new InventoryApplicationError('INVENTORY_RATE_LIMITED'),
    );
  });

  it('fails closed when no valid configuration is available (D-14)', async () => {
    const { service, deps } = createService();
    deps.config.findThresholdConfigSnapshot.mockResolvedValue(undefined);

    await expect(service.getThresholdConfig(ADMIN)).rejects.toThrow(
      new InventoryApplicationError('INVENTORY_THRESHOLD_CONFIG_UNAVAILABLE'),
    );
  });

  it('updates the thresholds for an admin with the adjust grant (version-checked, idempotent)', async () => {
    const { service, deps } = createService();
    const snapshot = await service.updateThresholdConfig({
      actorIdentityId: ADMIN,
      lowStockThreshold: 3,
      outOfStockThreshold: 2,
      expectedVersion: 0,
      idempotencyKey: 'config-1',
    });

    expect(snapshot.version).toBe(1);
    expect(deps.adminAuthorization.isGranted).toHaveBeenCalledWith(ADMIN, 'inventory.adjust.admin');
    expect(deps.config.saveThresholdConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        lowStockThreshold: 3,
        outOfStockThreshold: 2,
        expectedVersion: 0,
        changedByIdentityId: ADMIN,
      }),
    );
  });

  it('fails closed on an update without the adjust grant', async () => {
    const { service, deps } = createService();
    deps.adminAuthorization.isGranted.mockResolvedValue(false);

    await expect(
      service.updateThresholdConfig({
        actorIdentityId: ADMIN,
        lowStockThreshold: 3,
        outOfStockThreshold: 2,
        expectedVersion: 0,
        idempotencyKey: 'config-2',
      }),
    ).rejects.toThrow(new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED'));
  });

  it('propagates a version conflict from the repository (D-14 concurrency)', async () => {
    const { service, deps } = createService();
    deps.config.saveThresholdConfig.mockRejectedValue(
      new InventoryApplicationError('INVENTORY_STATE_CONFLICT'),
    );

    await expect(
      service.updateThresholdConfig({
        actorIdentityId: ADMIN,
        lowStockThreshold: 3,
        outOfStockThreshold: 2,
        expectedVersion: 0,
        idempotencyKey: 'config-3',
      }),
    ).rejects.toThrow(new InventoryApplicationError('INVENTORY_STATE_CONFLICT'));
  });

  it('never invokes the write when the caller is rate limited', async () => {
    const { service, deps } = createService();
    deps.rateLimiter.consume.mockResolvedValue({ allowed: false });

    await expect(
      service.updateThresholdConfig({
        actorIdentityId: ADMIN,
        lowStockThreshold: 3,
        outOfStockThreshold: 2,
        expectedVersion: 0,
        idempotencyKey: 'config-4',
      }),
    ).rejects.toThrow(new InventoryApplicationError('INVENTORY_RATE_LIMITED'));
    expect(deps.config.saveThresholdConfig).not.toHaveBeenCalled();
  });
});
