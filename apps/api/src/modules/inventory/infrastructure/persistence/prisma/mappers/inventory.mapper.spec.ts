import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { InventoryAuditRecord } from '../../../../domain/entities/inventory-audit-record';
import { InventoryMovementRecord } from '../../../../domain/entities/inventory-movement-record';
import { StockPool } from '../../../../domain/entities/stock-pool';
import { InventoryQuantity } from '../../../../domain/value-objects/inventory-quantity';
import {
  inventoryAuditRecordMapper,
  inventoryConfigRecordMapper,
  inventoryMovementRecordMapper,
  stockPoolMapper,
} from './inventory.mapper';

const POOL_ID = new UuidV7('01913110-789a-7123-8123-000000000201');
const SKU_ID = new UuidV7('01913110-789a-7123-8123-000000000202');
const SELLER_ID = new UuidV7('01913110-789a-7123-8123-000000000203');
const ACTOR_ID = new UuidV7('01913110-789a-7123-8123-000000000204');
const MOVEMENT_ID = new UuidV7('01913110-789a-7123-8123-000000000205');
const AUDIT_ID = new UuidV7('01913110-789a-7123-8123-000000000206');
const CONFIG_ID = new UuidV7('01913110-789a-7123-8123-000000000207');
const NOW = new Date('2026-08-14T00:00:00.000Z');

describe('M05 inventory persistence mappers (WEMP-M05-SPEC-001 §14)', () => {
  describe('stockPoolMapper', () => {
    it('maps a persisted pool row back to the domain', () => {
      const pool = stockPoolMapper.toDomain({
        stockPoolId: POOL_ID.value,
        skuId: SKU_ID.value,
        sellerProfileId: SELLER_ID.value,
        onHand: 100,
        reserved: 20,
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(pool.properties.stockPoolId).toEqual(POOL_ID);
      expect(pool.properties.onHand.value).toBe(100);
      expect(pool.available.value).toBe(80);
    });

    it('round-trips a pool to persistence', () => {
      const entity = new StockPool({
        stockPoolId: POOL_ID,
        skuId: SKU_ID,
        sellerProfileId: SELLER_ID,
        onHand: new InventoryQuantity(100),
        reserved: new InventoryQuantity(20),
        aggregateVersion: new AggregateVersion(1),
        createdAt: NOW,
        updatedAt: NOW,
      });
      const row = stockPoolMapper.toPersistence(entity);
      expect(row).toMatchObject({
        stockPoolId: POOL_ID.value,
        skuId: SKU_ID.value,
        sellerProfileId: SELLER_ID.value,
        onHand: 100,
        reserved: 20,
        aggregateVersion: 1,
      });
    });
  });

  describe('inventoryMovementRecordMapper', () => {
    it('maps a persisted movement row back to the domain', () => {
      const record = inventoryMovementRecordMapper.toDomain({
        movementId: MOVEMENT_ID.value,
        stockPoolId: POOL_ID.value,
        movementType: 'STOCK_IN',
        delta: 50,
        resultingOnHand: 150,
        resultingReserved: 20,
        actorIdentityId: ACTOR_ID.value,
        reasonReference: null,
        correlationId: null,
        causationId: null,
        aggregateVersion: 2,
        occurredAt: NOW,
        createdAt: NOW,
      });
      expect(record.properties.movementType).toBe('STOCK_IN');
      expect(record.properties.delta).toBe(50);
      expect(record.properties.resultingOnHand).toBe(150);
    });

    it('round-trips a movement with reason and correlation', () => {
      const entity = new InventoryMovementRecord({
        movementId: MOVEMENT_ID,
        stockPoolId: POOL_ID,
        movementType: 'STOCK_OUT',
        delta: 30,
        resultingOnHand: 70,
        resultingReserved: 20,
        actorIdentityId: ACTOR_ID,
        reasonReference: 'reason-001',
        correlationId: new CorrelationIdentifier('01913110-789a-7123-8123-000000000301'),
        aggregateVersion: new AggregateVersion(2),
        occurredAt: NOW,
        createdAt: NOW,
      });
      const row = inventoryMovementRecordMapper.toPersistence(entity);
      expect(row).toMatchObject({
        movementId: MOVEMENT_ID.value,
        movementType: 'STOCK_OUT',
        delta: 30,
        reasonReference: 'reason-001',
        correlationId: '01913110-789a-7123-8123-000000000301',
        aggregateVersion: 2,
      });
    });
  });

  describe('inventoryAuditRecordMapper', () => {
    it('round-trips an audit record', () => {
      const entity = new InventoryAuditRecord({
        auditEventId: AUDIT_ID,
        stockPoolId: POOL_ID,
        eventType: 'POOL_ACTIVATED',
        actorIdentityId: ACTOR_ID,
        occurredAt: NOW,
        createdAt: NOW,
        evidenceDigest: 'a'.repeat(64),
      });
      const row = inventoryAuditRecordMapper.toPersistence(entity);
      expect(row).toMatchObject({
        auditEventId: AUDIT_ID.value,
        stockPoolId: POOL_ID.value,
        eventType: 'POOL_ACTIVATED',
        evidenceDigest: 'a'.repeat(64),
      });
      const domain = inventoryAuditRecordMapper.toDomain({
        auditEventId: row.auditEventId,
        stockPoolId: row.stockPoolId,
        eventType: row.eventType,
        actorIdentityId: row.actorIdentityId,
        correlationId: null,
        evidenceDigest: row.evidenceDigest as string | null,
        occurredAt: NOW,
        createdAt: NOW,
      });
      expect(domain.properties.eventType).toBe('POOL_ACTIVATED');
    });
  });

  describe('inventoryConfigRecordMapper (D-14 table shape)', () => {
    it('round-trips a config record row', () => {
      const entity = {
        configId: CONFIG_ID,
        configKey: 'LOW_STOCK_THRESHOLD',
        configValue: '10',
        state: 'ACTIVE' as const,
        aggregateVersion: new AggregateVersion(1),
        changedByIdentityId: ACTOR_ID,
        createdAt: NOW,
        updatedAt: NOW,
      };
      const row = inventoryConfigRecordMapper.toPersistence(entity);
      expect(row).toMatchObject({
        configId: CONFIG_ID.value,
        configKey: 'LOW_STOCK_THRESHOLD',
        configValue: '10',
        state: 'ACTIVE',
        aggregateVersion: 1,
      });
      const domain = inventoryConfigRecordMapper.toDomain({
        configId: row.configId,
        configKey: row.configKey,
        configValue: row.configValue,
        state: row.state,
        aggregateVersion: row.aggregateVersion,
        changedByIdentityId: ACTOR_ID.value,
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(domain.configKey).toBe('LOW_STOCK_THRESHOLD');
      expect(domain.state).toBe('ACTIVE');
    });
  });
});
