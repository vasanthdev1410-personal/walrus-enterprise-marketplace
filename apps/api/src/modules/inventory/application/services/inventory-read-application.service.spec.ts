import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { StockPool } from '../../domain/entities/stock-pool';
import { InventoryStockPolicy } from '../../domain/policy/inventory-stock-policy';
import type {
  InventoryEvidenceReadRepository,
  InventoryStockPoolRepository,
} from '../../domain/ports/inventory-repository.port';
import type { Module02InventoryAuthorizationContractPort } from '../../domain/ports/module-02-authorization.port';
import type { Module04ProductCatalogReadPort } from '../../domain/ports/module-04-product-catalog.port';
import { InventoryQuantity } from '../../domain/value-objects/inventory-quantity';
import { InventoryThresholdConfig } from '../../domain/value-objects/inventory-threshold-config';
import { InventoryApplicationError } from '../errors/inventory-application.error';
import type { InventoryAdminAuthorizationPort } from '../ports/inventory-admin-authorization.port';
import type { InventoryThresholdConfigurationPort } from '../ports/inventory-threshold-configuration.port';
import { InventoryReadApplicationService } from './inventory-read-application.service';

const OWNER = new UuidV7('01900000-0000-7000-8000-000000000001');
const SELLER = new UuidV7('01900000-0000-7000-8000-000000000003');
const OTHER_SELLER = new UuidV7('01900000-0000-7000-8000-000000000004');
const SKU = new UuidV7('01900000-0000-7000-8000-000000000005');
const OTHER_SKU = new UuidV7('01900000-0000-7000-8000-000000000006');
const ADMIN = new UuidV7('01900000-0000-7000-8000-000000000007');

const NOW = new Date('2026-08-15T12:00:00.000Z');

const THRESHOLDS = new InventoryThresholdConfig({
  lowStockThreshold: 1,
  outOfStockThreshold: 0,
});

function pool(
  skuId: UuidV7,
  onHand = 100,
  reserved = 0,
  version = 1,
  sellerProfileId = SELLER,
): StockPool {
  return new StockPool({
    stockPoolId: new UuidV7('01900000-0000-7000-8000-000000000010'),
    skuId,
    sellerProfileId,
    onHand: new InventoryQuantity(onHand),
    reserved: new InventoryQuantity(reserved),
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface Dependencies {
  repository: InventoryStockPoolRepository;
  evidence: InventoryEvidenceReadRepository;
  module02: Module02InventoryAuthorizationContractPort;
  module04: Module04ProductCatalogReadPort;
  adminAuthorization: InventoryAdminAuthorizationPort;
  thresholdConfiguration: InventoryThresholdConfigurationPort;
  rateLimiter: { consume(): Promise<{ allowed: boolean }> };
}

function createService(overrides: Partial<Dependencies> = {}): {
  service: InventoryReadApplicationService;
  deps: Dependencies;
} {
  const deps: Dependencies = {
    repository: {
      findBySkuId: jest.fn().mockResolvedValue(pool(SKU)),
      findBySeller: jest.fn().mockResolvedValue([pool(SKU)]),
      findAll: jest.fn().mockResolvedValue([pool(SKU)]),
      ...({} as Omit<InventoryStockPoolRepository, 'findBySkuId' | 'findBySeller' | 'findAll'>),
    },
    evidence: {
      findMovements: jest.fn().mockResolvedValue([]),
      findAuditRecords: jest.fn().mockResolvedValue([]),
      ...({} as Omit<InventoryEvidenceReadRepository, 'findMovements' | 'findAuditRecords'>),
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
    thresholdConfiguration: { findThresholdConfig: jest.fn().mockResolvedValue(THRESHOLDS) },
    rateLimiter: { consume: jest.fn().mockResolvedValue({ allowed: true }) },
    ...overrides,
  };
  const service = new InventoryReadApplicationService(
    deps.repository,
    deps.evidence,
    deps.module02,
    deps.module04,
    deps.adminAuthorization,
    deps.thresholdConfiguration,
    new InventoryStockPolicy(),
    deps.rateLimiter as never,
  );
  return { service, deps };
}

describe('InventoryReadApplicationService (M05-M3, D-03/D-10/D-14)', () => {
  describe('getAvailability (D-10)', () => {
    it('returns AVAILABLE when the SKU is PUBLISHED and available > 0', async () => {
      const { service } = createService();
      const result = await service.getAvailability(SKU);
      expect(result.status).toBe('AVAILABLE');
      if (result.status === 'AVAILABLE') {
        expect(result.availableQuantity).toBe(100);
      }
    });

    it('returns UNAVAILABLE when the pool has no available quantity', async () => {
      const { service } = createService({
        repository: {
          findBySkuId: jest.fn().mockResolvedValue(pool(SKU, 0, 0, 1)),
          ...({} as Omit<InventoryStockPoolRepository, 'findBySkuId'>),
        },
      });
      const result = await service.getAvailability(SKU);
      expect(result.status).toBe('UNAVAILABLE');
    });

    it('returns UNAVAILABLE for an unknown/non-PUBLISHED SKU (fail closed)', async () => {
      const { service } = createService({
        module04: { getConsumableSkuFact: jest.fn().mockResolvedValue(null) },
      });
      const result = await service.getAvailability(SKU);
      expect(result.status).toBe('UNAVAILABLE');
    });

    it('returns UNAVAILABLE for a CLOSED SKU (D-15)', async () => {
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
      const result = await service.getAvailability(SKU);
      expect(result.status).toBe('UNAVAILABLE');
    });

    it('returns FAILED on internal error without fabricating availability', async () => {
      const { service } = createService({
        repository: {
          findBySkuId: jest.fn().mockRejectedValue(new Error('boom')),
          ...({} as Omit<InventoryStockPoolRepository, 'findBySkuId'>),
        },
      });
      const result = await service.getAvailability(SKU);
      expect(result.status).toBe('FAILED');
    });
  });

  describe('seller reads (non-enumerating, D-05/A-02)', () => {
    it('lists own inventory with derived labels (D-14)', async () => {
      const { service } = createService();
      const entries = await service.listOwnInventory(SELLER, OWNER);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        skuId: SKU.value,
        onHand: 100,
        available: 100,
        label: 'IN_STOCK',
      });
    });

    it('derives LOW_STOCK / OUT_OF_STOCK labels from the configured thresholds', async () => {
      const { service } = createService({
        repository: {
          findBySeller: jest
            .fn()
            .mockResolvedValue([
              pool(SKU, 1, 0, 1),
              pool(OTHER_SKU, 0, 0, 1),
              pool(new UuidV7('01900000-0000-7000-8000-000000000008'), 5, 0, 1),
            ]),
          ...({} as Omit<InventoryStockPoolRepository, 'findBySeller'>),
        },
      });
      const entries = await service.listOwnInventory(SELLER, OWNER);
      expect(entries.map((e) => e.label)).toEqual(['LOW_STOCK', 'OUT_OF_STOCK', 'IN_STOCK']);
    });

    it('omits labels when threshold configuration is missing (fail closed, D-14)', async () => {
      const { service } = createService({
        thresholdConfiguration: { findThresholdConfig: jest.fn().mockResolvedValue(undefined) },
      });
      const entries = await service.listOwnInventory(SELLER, OWNER);
      expect(entries[0]?.label).toBeUndefined();
    });

    it('denies reads without an ACTIVE association', async () => {
      const { service } = createService({
        module02: { resolveActiveAssociation: jest.fn().mockResolvedValue(null) },
      });
      await expect(service.listOwnInventory(SELLER, OWNER)).rejects.toThrow(
        new InventoryApplicationError('INVENTORY_OWNERSHIP_DENIED'),
      );
    });

    it('hides another seller pool as not found (non-enumerating)', async () => {
      const { service } = createService({
        repository: {
          findBySkuId: jest.fn().mockResolvedValue(pool(SKU, 100, 0, 1, OTHER_SELLER)),
          ...({} as Omit<InventoryStockPoolRepository, 'findBySkuId'>),
        },
      });
      await expect(service.getOwnSkuDetail(SKU, SELLER, OWNER)).rejects.toThrow(
        new InventoryApplicationError('INVENTORY_NOT_FOUND'),
      );
    });

    it('denies reads when rate-limited (D-11: seller reads 60/hour)', async () => {
      const { service } = createService({
        rateLimiter: { consume: jest.fn().mockResolvedValue({ allowed: false }) },
      });
      await expect(service.listOwnInventory(SELLER, OWNER)).rejects.toThrow(
        new InventoryApplicationError('INVENTORY_RATE_LIMITED'),
      );
    });
  });

  describe('admin reads (D-05: inventory.audit.view)', () => {
    it('lists admin inventory with labels', async () => {
      const { service } = createService();
      const entries = await service.listAdminInventory(ADMIN);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.skuId).toBe(SKU.value);
    });

    it('denies admin reads without the inventory.audit.view grant', async () => {
      const { service } = createService({
        adminAuthorization: { isGranted: jest.fn().mockResolvedValue(false) },
      });
      await expect(service.listAdminInventory(ADMIN)).rejects.toThrow(
        new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED'),
      );
    });

    it('returns detail with audit records and movement ledger', async () => {
      const movement = {
        properties: {
          movementId: { value: new UuidV7('01900000-0000-7000-8000-000000000030').value },
          movementType: 'STOCK_IN',
          delta: 25,
          resultingOnHand: 125,
          resultingReserved: 0,
          actorIdentityId: { value: OWNER.value },
          reasonReference: 'ref-001',
          occurredAt: NOW,
        },
      };
      const audit = {
        properties: {
          eventType: 'POOL_ACTIVATED',
          actorIdentityId: { value: OWNER.value },
          occurredAt: NOW,
        },
      };
      const { service } = createService({
        evidence: {
          findMovements: jest.fn().mockResolvedValue([movement as never]),
          findAuditRecords: jest.fn().mockResolvedValue([audit as never]),
          ...({} as Omit<InventoryEvidenceReadRepository, 'findMovements' | 'findAuditRecords'>),
        },
      });
      const detail = await service.getAdminSkuDetail(ADMIN, SKU);
      expect(detail.audit[0]?.eventType).toBe('POOL_ACTIVATED');
      expect(detail.movements[0]?.movementType).toBe('STOCK_IN');
      expect(detail.movements[0]?.reasonReference).toBe('ref-001');
    });
  });
});
