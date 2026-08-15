import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { StockPool } from '../../domain/entities/stock-pool';
import { InventoryStockPolicy } from '../../domain/policy/inventory-stock-policy';
import { InventoryDomainError } from '../../domain/errors/inventory-domain.error';
import type {
  InventoryAggregateChangeSet,
  InventoryStockPoolRepository,
} from '../../domain/ports/inventory-repository.port';
import type { Module02InventoryAuthorizationContractPort } from '../../domain/ports/module-02-authorization.port';
import type { Module04ProductCatalogReadPort } from '../../domain/ports/module-04-product-catalog.port';
import { InventoryDelta } from '../../domain/value-objects/inventory-delta';
import { InventoryQuantity } from '../../domain/value-objects/inventory-quantity';
import type { InventoryAdminAuthorizationPort } from '../ports/inventory-admin-authorization.port';
import { InventoryApplicationError } from '../errors/inventory-application.error';
import { InventoryApplicationService } from './inventory-application.service';

const OWNER = new UuidV7('01900000-0000-7000-8000-000000000001');
const SELLER = new UuidV7('01900000-0000-7000-8000-000000000003');
const OTHER_SELLER = new UuidV7('01900000-0000-7000-8000-000000000004');
const SKU = new UuidV7('01900000-0000-7000-8000-000000000005');
const ADMIN = new UuidV7('01900000-0000-7000-8000-000000000006');

const NOW = new Date('2026-08-15T12:00:00.000Z');

function pool(onHand = 100, reserved = 0, version = 1): StockPool {
  return new StockPool({
    stockPoolId: new UuidV7('01900000-0000-7000-8000-000000000010'),
    skuId: SKU,
    sellerProfileId: SELLER,
    onHand: new InventoryQuantity(onHand),
    reserved: new InventoryQuantity(reserved),
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface Dependencies {
  repository: InventoryStockPoolRepository;
  module02: Module02InventoryAuthorizationContractPort;
  module04: Module04ProductCatalogReadPort;
  adminAuthorization: InventoryAdminAuthorizationPort;
  idempotency: { execute<T>(execution: { execute: () => Promise<T> }): Promise<T> };
  rateLimiter: { consume(): Promise<{ allowed: boolean }> };
}

function createService(overrides: Partial<Dependencies> = {}): {
  service: InventoryApplicationService;
  deps: Dependencies;
  captured: { changeSets: InventoryAggregateChangeSet[] };
} {
  const captured: { changeSets: InventoryAggregateChangeSet[] } = { changeSets: [] };
  const deps: Dependencies = {
    repository: {
      mutate: jest.fn(
        async (
          _skuId: UuidV7,
          mutate: (p: StockPool | null) => Promise<InventoryAggregateChangeSet>,
        ) => {
          const changeSet = await mutate(pool());
          captured.changeSets.push(changeSet);
        },
      ),
      ...({} as Omit<InventoryStockPoolRepository, 'mutate'>),
    },
    module02: {
      resolveActiveAssociation: jest.fn().mockResolvedValue({
        identityId: OWNER,
        sellerProfileId: SELLER,
        associationRole: 'OWNER',
        associationState: 'ACTIVE',
      }),
    },
    module04: {
      getConsumableSkuFact: jest.fn().mockResolvedValue({
        skuId: SKU,
        sellerProfileId: SELLER,
        skuCode: 'SKU-001',
        state: 'ACTIVE',
      }),
    },
    adminAuthorization: { isGranted: jest.fn().mockResolvedValue(true) },
    idempotency: { execute: jest.fn(async ({ execute }) => execute()) },
    rateLimiter: { consume: jest.fn().mockResolvedValue({ allowed: true }) },
    ...overrides,
  };
  const service = new InventoryApplicationService(
    deps.repository,
    deps.module02,
    deps.module04,
    deps.adminAuthorization,
    new InventoryStockPolicy(),
    { now: () => NOW },
    { next: () => new UuidV7('01900000-0000-7000-8000-000000000020') },
    deps.idempotency as never,
    deps.rateLimiter as never,
  );
  return { service, deps, captured };
}

describe('InventoryApplicationService (M05-M3, WEMP-M05-SPEC-001 §6/§8/§9)', () => {
  describe('adjustStock — seller flow (D-04/D-05/D-08)', () => {
    it('STOCK_IN adds to onHand and returns the resulting snapshot', async () => {
      const { service } = createService();
      const result = await service.adjustStock({
        sellerProfileId: SELLER,
        actorIdentityId: OWNER,
        skuId: SKU,
        movementType: 'STOCK_IN',
        delta: new InventoryDelta(25),
        expectedVersion: 1,
        idempotencyKey: 'key-001',
      });
      expect(result).toEqual({
        skuId: SKU.value,
        onHand: 125,
        reserved: 0,
        available: 125,
        version: 2,
      });
    });

    it('STOCK_OUT subtracts and requires a reason reference (D-08)', async () => {
      const { service, captured } = createService();
      const result = await service.adjustStock({
        sellerProfileId: SELLER,
        actorIdentityId: OWNER,
        skuId: SKU,
        movementType: 'STOCK_OUT',
        delta: new InventoryDelta(10),
        expectedVersion: 1,
        reasonReference: 'sale-ref-001',
        idempotencyKey: 'key-002',
      });
      expect(result.onHand).toBe(90);
      expect(captured.changeSets[0]?.movementsToAppend[0]?.properties.reasonReference).toBe(
        'sale-ref-001',
      );
    });

    it('ADJUSTMENT requires a direction and a reason', async () => {
      const { service } = createService();
      const result = await service.adjustStock({
        sellerProfileId: SELLER,
        actorIdentityId: OWNER,
        skuId: SKU,
        movementType: 'ADJUSTMENT',
        delta: new InventoryDelta(5),
        direction: 'DECREASE',
        expectedVersion: 1,
        reasonReference: 'damage-ref-001',
        idempotencyKey: 'key-003',
      });
      expect(result.onHand).toBe(95);
    });

    it('denies a movement that would make available negative (D-02)', async () => {
      const { service } = createService({
        repository: {
          mutate: jest.fn(
            async (
              _skuId: UuidV7,
              mutate: (p: StockPool | null) => Promise<InventoryAggregateChangeSet>,
            ) => {
              await mutate(pool(10, 0, 1));
            },
          ),
          ...({} as Omit<InventoryStockPoolRepository, 'mutate'>),
        },
      });
      await expect(
        service.adjustStock({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          skuId: SKU,
          movementType: 'STOCK_OUT',
          delta: new InventoryDelta(11),
          expectedVersion: 1,
          reasonReference: 'sale-ref-002',
          idempotencyKey: 'key-004',
        }),
      ).rejects.toThrow(new InventoryDomainError('INVENTORY_NEGATIVE_AVAILABLE'));
    });

    it('denies a stale expectedVersion (D-07)', async () => {
      const { service } = createService();
      await expect(
        service.adjustStock({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          skuId: SKU,
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(5),
          expectedVersion: 99,
          idempotencyKey: 'key-005',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_STATE_CONFLICT'));
    });

    it('denies a MEMBER association (owner-only, D-05)', async () => {
      const { service } = createService({
        module02: {
          resolveActiveAssociation: jest.fn().mockResolvedValue({
            identityId: OWNER,
            sellerProfileId: SELLER,
            associationRole: 'MEMBER',
            associationState: 'ACTIVE',
          }),
        },
      });
      await expect(
        service.adjustStock({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          skuId: SKU,
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(5),
          expectedVersion: 1,
          idempotencyKey: 'key-006',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_OWNERSHIP_DENIED'));
    });

    it('denies when the caller has no active association (fail closed)', async () => {
      const { service } = createService({
        module02: { resolveActiveAssociation: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.adjustStock({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          skuId: SKU,
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(5),
          expectedVersion: 1,
          idempotencyKey: 'key-007',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_OWNERSHIP_DENIED'));
    });

    it('denies a SKU that belongs to another seller organization (D-08)', async () => {
      const { service } = createService({
        module04: {
          getConsumableSkuFact: jest.fn().mockResolvedValue({
            skuId: SKU,
            sellerProfileId: OTHER_SELLER,
            skuCode: 'SKU-002',
            state: 'ACTIVE',
          }),
        },
      });
      await expect(
        service.adjustStock({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          skuId: SKU,
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(5),
          expectedVersion: 1,
          idempotencyKey: 'key-008',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_OWNERSHIP_DENIED'));
    });

    it('denies an unknown or non-PUBLISHED SKU (D-08/D-10, fail closed)', async () => {
      const { service } = createService({
        module04: { getConsumableSkuFact: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.adjustStock({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          skuId: SKU,
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(5),
          expectedVersion: 1,
          idempotencyKey: 'key-009',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_SKU_UNAVAILABLE'));
    });

    it('denies a CLOSED SKU (D-15 read-only pool)', async () => {
      const { service } = createService({
        module04: {
          getConsumableSkuFact: jest.fn().mockResolvedValue({
            skuId: SKU,
            sellerProfileId: SELLER,
            skuCode: 'SKU-001',
            state: 'CLOSED',
          }),
        },
      });
      await expect(
        service.adjustStock({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          skuId: SKU,
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(5),
          expectedVersion: 1,
          idempotencyKey: 'key-010',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_STATE_CONFLICT'));
    });

    it('denies when rate-limited (D-11: 30/hour, recorded 2026-08-15)', async () => {
      const { service } = createService({
        rateLimiter: { consume: jest.fn().mockResolvedValue({ allowed: false }) },
      });
      await expect(
        service.adjustStock({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          skuId: SKU,
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(5),
          expectedVersion: 1,
          idempotencyKey: 'key-011',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_RATE_LIMITED'));
    });
  });

  describe('adjustStock — pool activation (D-15)', () => {
    it('creates the pool on the first recorded movement with a POOL_ACTIVATED audit', async () => {
      let activated = false;
      const { service, captured } = createService({
        repository: {
          mutate: jest.fn(
            async (
              _skuId: UuidV7,
              mutate: (p: StockPool | null) => Promise<InventoryAggregateChangeSet>,
            ) => {
              const changeSet = await mutate(null);
              activated = true;
              captured.changeSets.push(changeSet);
            },
          ),
          ...({} as Omit<InventoryStockPoolRepository, 'mutate'>),
        },
      });
      const result = await service.adjustStock({
        sellerProfileId: SELLER,
        actorIdentityId: OWNER,
        skuId: SKU,
        movementType: 'STOCK_IN',
        delta: new InventoryDelta(50),
        expectedVersion: 0,
        idempotencyKey: 'key-012',
      });
      expect(activated).toBe(true);
      expect(result).toEqual({
        skuId: SKU.value,
        onHand: 50,
        reserved: 0,
        available: 50,
        version: 2,
      });
      const changeSet = captured.changeSets[0];
      expect(changeSet?.auditRecordsToAppend.map((a) => a.properties.eventType)).toEqual([
        'POOL_ACTIVATED',
      ]);
      expect(changeSet?.pool.properties.aggregateVersion.value).toBe(2);
    });

    it('denies activation when the caller expects an existing pool', async () => {
      const { service } = createService({
        repository: {
          mutate: jest.fn(
            async (
              _skuId: UuidV7,
              mutate: (p: StockPool | null) => Promise<InventoryAggregateChangeSet>,
            ) => {
              await mutate(null);
            },
          ),
          ...({} as Omit<InventoryStockPoolRepository, 'mutate'>),
        },
      });
      await expect(
        service.adjustStock({
          sellerProfileId: SELLER,
          actorIdentityId: OWNER,
          skuId: SKU,
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(5),
          expectedVersion: 1,
          idempotencyKey: 'key-013',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_STATE_CONFLICT'));
    });
  });

  describe('adminCorrectStock — admin flow (D-04/D-05/D-08)', () => {
    it('COUNT_CORRECTION sets onHand to the target with a mandatory reason', async () => {
      const { service, captured } = createService();
      const result = await service.adminCorrectStock({
        actorIdentityId: ADMIN,
        skuId: SKU,
        targetOnHand: new InventoryQuantity(77),
        expectedVersion: 1,
        reasonReference: 'admin-count-001',
        idempotencyKey: 'key-014',
      });
      expect(result.onHand).toBe(77);
      expect(captured.changeSets[0]?.movementsToAppend[0]?.properties.movementType).toBe(
        'COUNT_CORRECTION',
      );
      expect(captured.changeSets[0]?.movementsToAppend[0]?.properties.reasonReference).toBe(
        'admin-count-001',
      );
    });

    it('denies without the inventory.adjust.admin grant (D-05, fail closed)', async () => {
      const { service } = createService({
        adminAuthorization: { isGranted: jest.fn().mockResolvedValue(false) },
      });
      await expect(
        service.adminCorrectStock({
          actorIdentityId: ADMIN,
          skuId: SKU,
          targetOnHand: new InventoryQuantity(50),
          expectedVersion: 1,
          reasonReference: 'admin-count-002',
          idempotencyKey: 'key-015',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED'));
    });

    it('denies an unknown/non-PUBLISHED SKU (D-08)', async () => {
      const { service } = createService({
        module04: { getConsumableSkuFact: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.adminCorrectStock({
          actorIdentityId: ADMIN,
          skuId: SKU,
          targetOnHand: new InventoryQuantity(50),
          expectedVersion: 1,
          reasonReference: 'admin-count-003',
          idempotencyKey: 'key-016',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_SKU_UNAVAILABLE'));
    });

    it('uses the authoritative seller scope from the SKU fact on activation', async () => {
      let activationSeller: string | undefined;
      const { service } = createService({
        module04: {
          getConsumableSkuFact: jest.fn().mockResolvedValue({
            skuId: SKU,
            sellerProfileId: SELLER,
            skuCode: 'SKU-001',
            state: 'ACTIVE',
          }),
        },
        repository: {
          mutate: jest.fn(
            async (
              _skuId: UuidV7,
              mutate: (p: StockPool | null) => Promise<InventoryAggregateChangeSet>,
            ) => {
              const changeSet = await mutate(null);
              activationSeller = changeSet.pool.properties.sellerProfileId.value;
            },
          ),
          ...({} as Omit<InventoryStockPoolRepository, 'mutate'>),
        },
      });
      await service.adminCorrectStock({
        actorIdentityId: ADMIN,
        skuId: SKU,
        targetOnHand: new InventoryQuantity(40),
        expectedVersion: 0,
        reasonReference: 'admin-count-004',
        idempotencyKey: 'key-017',
      });
      expect(activationSeller).toBe(SELLER.value);
    });

    it('denies when rate-limited (D-11: admin corrections 50/hour)', async () => {
      const { service } = createService({
        rateLimiter: { consume: jest.fn().mockResolvedValue({ allowed: false }) },
      });
      await expect(
        service.adminCorrectStock({
          actorIdentityId: ADMIN,
          skuId: SKU,
          targetOnHand: new InventoryQuantity(50),
          expectedVersion: 1,
          reasonReference: 'admin-count-005',
          idempotencyKey: 'key-018',
        }),
      ).rejects.toThrow(new InventoryApplicationError('INVENTORY_RATE_LIMITED'));
    });
  });
});
