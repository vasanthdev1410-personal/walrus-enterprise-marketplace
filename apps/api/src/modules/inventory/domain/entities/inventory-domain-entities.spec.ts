import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { InventoryQuantity } from '../value-objects/inventory-quantity';
import { InventoryMovementRecord } from './inventory-movement-record';
import { InventoryAuditRecord } from './inventory-audit-record';
import { StockPool } from './stock-pool';

const POOL = new UuidV7('0191310f-789a-7123-8123-000000000201');
const SKU = new UuidV7('0191310f-789a-7123-8123-000000000202');
const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000203');
const IDENTITY = new UuidV7('0191310f-789a-7123-8123-000000000204');
const MOVEMENT = new UuidV7('0191310f-789a-7123-8123-000000000205');
const AUDIT = new UuidV7('0191310f-789a-7123-8123-000000000206');
const NOW = new Date('2026-08-14T00:00:00.000Z');

function uu(seed: string): UuidV7 {
  return new UuidV7(`0191310f-789a-7123-8123-${seed.padStart(12, '0')}`);
}

describe('Inventory domain entities (M05-M1, WEMP-M05-SPEC-001 §4/§10/§14)', () => {
  describe('StockPool (D-01/D-02)', () => {
    const base = {
      stockPoolId: POOL,
      skuId: SKU,
      sellerProfileId: SELLER,
      onHand: new InventoryQuantity(100),
      reserved: new InventoryQuantity(20),
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('accepts a valid pool and derives available = onHand − reserved (never stored)', () => {
      const pool = new StockPool(base);
      expect(pool.properties.onHand.value).toBe(100);
      expect(pool.properties.reserved.value).toBe(20);
      expect(pool.available.value).toBe(80);
    });

    it('rejects a pool with reserved exceeding onHand (negative available denied, D-02)', () => {
      expect(
        () =>
          new StockPool({
            ...base,
            onHand: new InventoryQuantity(10),
            reserved: new InventoryQuantity(11),
          }),
      ).toThrow('Reserved quantity must not exceed on-hand quantity');
    });

    it('rejects timestamps before creation', () => {
      expect(
        () =>
          new StockPool({
            ...base,
            updatedAt: new Date('2026-08-13T00:00:00.000Z'),
          }),
      ).toThrow('Stock pool updatedAt cannot precede createdAt');
    });
  });

  describe('InventoryMovementRecord (D-09 append-only ledger)', () => {
    const base = {
      movementId: MOVEMENT,
      stockPoolId: POOL,
      movementType: 'STOCK_IN' as const,
      delta: 50,
      resultingOnHand: 150,
      resultingReserved: 20,
      actorIdentityId: IDENTITY,
      correlationId: new CorrelationIdentifier(uu('301').value),
      aggregateVersion: new AggregateVersion(2),
      occurredAt: NOW,
      createdAt: NOW,
    };

    it('accepts a valid movement record', () => {
      const record = new InventoryMovementRecord(base);
      expect(record.properties.movementType).toBe('STOCK_IN');
      expect(record.properties.delta).toBe(50);
      expect(record.properties.correlationId?.value).toBe(uu('301').value);
    });

    it('rejects a non-positive or non-integer delta', () => {
      expect(() => new InventoryMovementRecord({ ...base, delta: 0 })).toThrow(
        'Movement delta must be a positive safe integer',
      );
      expect(() => new InventoryMovementRecord({ ...base, delta: -5 })).toThrow(
        'Movement delta must be a positive safe integer',
      );
    });

    it('rejects negative resulting quantities and reserved over onHand', () => {
      expect(() => new InventoryMovementRecord({ ...base, resultingOnHand: -1 })).toThrow(
        'Resulting on-hand quantity must be a non-negative safe integer',
      );
      expect(() => new InventoryMovementRecord({ ...base, resultingReserved: 200 })).toThrow(
        'Resulting reserved quantity must not exceed resulting on-hand quantity',
      );
    });

    it('rejects a blank reason reference', () => {
      expect(() => new InventoryMovementRecord({ ...base, reasonReference: '   ' })).toThrow(
        'Reason reference must not be blank when provided',
      );
    });

    it('rejects createdAt before occurredAt', () => {
      expect(
        () =>
          new InventoryMovementRecord({
            ...base,
            createdAt: new Date('2026-08-13T00:00:00.000Z'),
          }),
      ).toThrow('Movement createdAt cannot precede occurredAt');
    });
  });

  describe('InventoryAuditRecord (D-09 secondary business audit)', () => {
    const base = {
      auditEventId: AUDIT,
      stockPoolId: POOL,
      eventType: 'POOL_ACTIVATED',
      actorIdentityId: IDENTITY,
      occurredAt: NOW,
      createdAt: NOW,
    };

    it('accepts a valid audit record', () => {
      expect(new InventoryAuditRecord(base).properties.eventType).toBe('POOL_ACTIVATED');
    });

    it('rejects an empty event type', () => {
      expect(() => new InventoryAuditRecord({ ...base, eventType: '   ' })).toThrow(
        'Audit event type is required',
      );
    });

    it('rejects a non-SHA-256 evidence digest', () => {
      expect(
        () =>
          new InventoryAuditRecord({
            ...base,
            evidenceDigest: 'short',
          }),
      ).toThrow('Audit evidence digest must be a SHA-256 hex digest');
      expect(
        () =>
          new InventoryAuditRecord({
            ...base,
            evidenceDigest: 'g'.repeat(64),
          }),
      ).toThrow('Audit evidence digest must be a SHA-256 hex digest');
    });

    it('rejects createdAt before occurredAt', () => {
      expect(
        () =>
          new InventoryAuditRecord({
            ...base,
            createdAt: new Date('2026-08-13T00:00:00.000Z'),
          }),
      ).toThrow('Audit createdAt cannot precede occurredAt');
    });
  });
});
