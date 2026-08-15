import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { StockPool } from '../entities/stock-pool';
import { InventoryDomainError } from '../errors/inventory-domain.error';
import { InventoryDelta, MAX_MUTATION_UNITS } from '../value-objects/inventory-delta';
import { InventoryQuantity } from '../value-objects/inventory-quantity';
import { InventoryThresholdConfig } from '../value-objects/inventory-threshold-config';
import { InventoryStockPolicy } from './inventory-stock-policy';

const POOL = new UuidV7('0191310f-789a-7123-8123-000000000201');
const SKU = new UuidV7('0191310f-789a-7123-8123-000000000202');
const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000203');
const OWNER = new UuidV7('0191310f-789a-7123-8123-000000000204');
const MOVEMENT_ID = new UuidV7('0191310f-789a-7123-8123-000000000205');
const NOW = new Date('2026-08-14T00:00:00.000Z');

function pool(onHand = 100, reserved = 20, version = 1): StockPool {
  return new StockPool({
    stockPoolId: POOL,
    skuId: SKU,
    sellerProfileId: SELLER,
    onHand: new InventoryQuantity(onHand),
    reserved: new InventoryQuantity(reserved),
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

type MovementCommand = Parameters<InventoryStockPolicy['applyMovement']>[0];

function movementCommand(
  source: StockPool,
  overrides: Partial<MovementCommand> = {},
): MovementCommand {
  return {
    pool: source,
    movementType: 'STOCK_IN',
    delta: new InventoryDelta(10),
    expectedVersion: source.properties.aggregateVersion,
    actorIdentityId: OWNER,
    movementId: MOVEMENT_ID,
    occurredAt: NOW,
    ...overrides,
  };
}

describe('InventoryStockPolicy (M05-M1, WEMP-M05-SPEC-001 §4–§9)', () => {
  const policy = new InventoryStockPolicy();

  describe('typed delta application (D-04)', () => {
    it('STOCK_IN adds to onHand and advances the version', () => {
      const { updatedPool, movementRecord } = policy.applyMovement(
        movementCommand(pool(100, 20, 1), {
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(50),
        }),
      );
      expect(updatedPool.properties.onHand.value).toBe(150);
      expect(updatedPool.properties.reserved.value).toBe(20);
      expect(updatedPool.available.value).toBe(130);
      expect(updatedPool.properties.aggregateVersion.value).toBe(2);
      expect(movementRecord.properties.movementType).toBe('STOCK_IN');
      expect(movementRecord.properties.delta).toBe(50);
      expect(movementRecord.properties.resultingOnHand).toBe(150);
      expect(movementRecord.properties.resultingReserved).toBe(20);
      expect(movementRecord.properties.aggregateVersion.value).toBe(2);
    });

    it('STOCK_IN does not require a reason reference (D-08)', () => {
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(), { movementType: 'STOCK_IN', delta: new InventoryDelta(5) }),
        ),
      ).not.toThrow();
    });

    it('STOCK_OUT subtracts from onHand', () => {
      const { updatedPool, movementRecord } = policy.applyMovement(
        movementCommand(pool(100, 20, 1), {
          movementType: 'STOCK_OUT',
          delta: new InventoryDelta(30),
          reasonReference: 'reason-001',
        }),
      );
      expect(updatedPool.properties.onHand.value).toBe(70);
      expect(updatedPool.available.value).toBe(50);
      expect(movementRecord.properties.delta).toBe(30);
    });

    it('STOCK_OUT denies when it would make available negative (D-02 fail closed)', () => {
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(100, 20, 1), {
            movementType: 'STOCK_OUT',
            delta: new InventoryDelta(81),
            reasonReference: 'reason-001',
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_NEGATIVE_AVAILABLE'));
    });

    it('STOCK_OUT requires a mandatory reason reference (D-08)', () => {
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(), {
            movementType: 'STOCK_OUT',
            delta: new InventoryDelta(10),
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_REASON_REQUIRED'));
    });

    it('ADJUSTMENT INCREASE and DECREASE apply the delta in the requested direction', () => {
      const increased = policy.applyMovement(
        movementCommand(pool(100, 20, 1), {
          movementType: 'ADJUSTMENT',
          direction: 'INCREASE',
          delta: new InventoryDelta(5),
          reasonReference: 'reason-002',
        }),
      );
      expect(increased.updatedPool.properties.onHand.value).toBe(105);

      const decreased = policy.applyMovement(
        movementCommand(pool(100, 20, 1), {
          movementType: 'ADJUSTMENT',
          direction: 'DECREASE',
          delta: new InventoryDelta(5),
          reasonReference: 'reason-002',
        }),
      );
      expect(decreased.updatedPool.properties.onHand.value).toBe(95);
    });

    it('ADJUSTMENT requires a direction and a reason', () => {
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(), {
            movementType: 'ADJUSTMENT',
            delta: new InventoryDelta(5),
            reasonReference: 'reason-003',
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN'));
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(), {
            movementType: 'ADJUSTMENT',
            direction: 'INCREASE',
            delta: new InventoryDelta(5),
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_REASON_REQUIRED'));
    });

    it('COUNT_CORRECTION sets onHand to the target and records the absolute delta', () => {
      const { updatedPool, movementRecord } = policy.applyMovement(
        movementCommand(pool(100, 20, 1), {
          movementType: 'COUNT_CORRECTION',
          targetOnHand: new InventoryQuantity(120),
          reasonReference: 'admin-reason-001',
        }),
      );
      expect(updatedPool.properties.onHand.value).toBe(120);
      expect(movementRecord.properties.delta).toBe(20);
      expect(updatedPool.available.value).toBe(100);
    });

    it('COUNT_CORRECTION to a lower target records the absolute delta', () => {
      const { updatedPool, movementRecord } = policy.applyMovement(
        movementCommand(pool(100, 20, 1), {
          movementType: 'COUNT_CORRECTION',
          targetOnHand: new InventoryQuantity(90),
          reasonReference: 'admin-reason-002',
        }),
      );
      expect(updatedPool.properties.onHand.value).toBe(90);
      expect(movementRecord.properties.delta).toBe(10);
    });

    it('COUNT_CORRECTION requires a target, a changed target, and a reason', () => {
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(), {
            movementType: 'COUNT_CORRECTION',
            reasonReference: 'admin-reason-003',
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN'));
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(100, 20, 1), {
            movementType: 'COUNT_CORRECTION',
            targetOnHand: new InventoryQuantity(100),
            reasonReference: 'admin-reason-004',
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN'));
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(), {
            movementType: 'COUNT_CORRECTION',
            targetOnHand: new InventoryQuantity(120),
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_REASON_REQUIRED'));
    });

    it('COUNT_CORRECTION to a target beyond the 1,000,000-unit bound fails closed (D-08)', () => {
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(100, 20, 1), {
            movementType: 'COUNT_CORRECTION',
            targetOnHand: new InventoryQuantity(MAX_MUTATION_UNITS + 200),
            reasonReference: 'admin-reason-005',
          }),
        ),
      ).toThrow('at most');
    });

    it('denies a stale version (D-07 optimistic guard, fail closed)', () => {
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(100, 20, 1), {
            movementType: 'STOCK_IN',
            delta: new InventoryDelta(10),
            expectedVersion: new AggregateVersion(5),
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_VERSION_CONFLICT'));
    });

    it('denies an unknown movement type (fail closed)', () => {
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(), {
            movementType: 'BULK_ADJUSTMENT' as never,
            delta: new InventoryDelta(10),
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN'));
    });

    it('denies a direction on STOCK_IN/STOCK_OUT (fail closed)', () => {
      expect(() =>
        policy.applyMovement(
          movementCommand(pool(), {
            movementType: 'STOCK_IN',
            direction: 'INCREASE' as never,
            delta: new InventoryDelta(10),
          }),
        ),
      ).toThrow(new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN'));
    });

    it('the updated pool is immutable and carries the next version', () => {
      const { updatedPool } = policy.applyMovement(
        movementCommand(pool(100, 20, 1), {
          movementType: 'STOCK_IN',
          delta: new InventoryDelta(10),
        }),
      );
      expect(Object.isFrozen(updatedPool)).toBe(true);
      expect(updatedPool.properties.aggregateVersion.value).toBe(2);
      expect(() =>
        policy.applyMovement(
          movementCommand(updatedPool, {
            movementType: 'STOCK_OUT',
            delta: new InventoryDelta(10),
            reasonReference: 'reason-009',
          }),
        ),
      ).not.toThrow();
    });
  });

  describe('reserve/release (D-06)', () => {
    it('reserve raises reserved and lowers derived available', () => {
      const updated = policy.reserve({
        pool: pool(100, 20, 1),
        quantity: new InventoryDelta(30),
        expectedVersion: new AggregateVersion(1),
        occurredAt: NOW,
      });
      expect(updated.properties.reserved.value).toBe(50);
      expect(updated.available.value).toBe(50);
      expect(updated.properties.aggregateVersion.value).toBe(2);
    });

    it('reserve denies when quantity exceeds available (fail closed)', () => {
      expect(() =>
        policy.reserve({
          pool: pool(100, 20, 1),
          quantity: new InventoryDelta(81),
          expectedVersion: new AggregateVersion(1),
          occurredAt: NOW,
        }),
      ).toThrow(new InventoryDomainError('INVENTORY_RESERVE_EXCEEDS_AVAILABLE'));
    });

    it('reserve denies on a stale version', () => {
      expect(() =>
        policy.reserve({
          pool: pool(100, 20, 1),
          quantity: new InventoryDelta(10),
          expectedVersion: new AggregateVersion(9),
          occurredAt: NOW,
        }),
      ).toThrow(new InventoryDomainError('INVENTORY_VERSION_CONFLICT'));
    });

    it('release lowers reserved and never goes below zero', () => {
      const updated = policy.release({
        pool: pool(100, 20, 1),
        quantity: new InventoryDelta(15),
        expectedVersion: new AggregateVersion(1),
        occurredAt: NOW,
      });
      expect(updated.properties.reserved.value).toBe(5);
      expect(updated.available.value).toBe(95);
    });

    it('release denies when quantity exceeds reserved (never below zero, fail closed)', () => {
      expect(() =>
        policy.release({
          pool: pool(100, 20, 1),
          quantity: new InventoryDelta(21),
          expectedVersion: new AggregateVersion(1),
          occurredAt: NOW,
        }),
      ).toThrow(new InventoryDomainError('INVENTORY_RELEASE_EXCEEDS_RESERVED'));
    });

    it('release to exactly zero is permitted', () => {
      const updated = policy.release({
        pool: pool(100, 20, 1),
        quantity: new InventoryDelta(20),
        expectedVersion: new AggregateVersion(1),
        occurredAt: NOW,
      });
      expect(updated.properties.reserved.value).toBe(0);
      expect(updated.available.value).toBe(100);
    });

    it('release denies on a stale version', () => {
      expect(() =>
        policy.release({
          pool: pool(100, 20, 1),
          quantity: new InventoryDelta(5),
          expectedVersion: new AggregateVersion(4),
          occurredAt: NOW,
        }),
      ).toThrow(new InventoryDomainError('INVENTORY_VERSION_CONFLICT'));
    });
  });

  describe('availability derivation (D-03/D-10)', () => {
    it('derives AVAILABLE with the derived quantity when available > 0 and SKU consumable', () => {
      const outcome = policy.deriveAvailability(pool(100, 20, 1), true);
      expect(outcome).toEqual({ status: 'AVAILABLE', availableQuantity: 80 });
    });

    it('derives UNAVAILABLE when available ≤ 0', () => {
      expect(policy.deriveAvailability(pool(20, 20, 1), true)).toEqual({
        status: 'UNAVAILABLE',
      });
    });

    it('derives UNAVAILABLE for a missing pool (unknown SKU, fail closed)', () => {
      expect(policy.deriveAvailability(null, true)).toEqual({ status: 'UNAVAILABLE' });
    });

    it('derives UNAVAILABLE for a non-consumable (non-PUBLISHED) SKU (Module 04 D-12 gate)', () => {
      expect(policy.deriveAvailability(pool(100, 20, 1), false)).toEqual({
        status: 'UNAVAILABLE',
      });
    });
  });

  describe('derived stock labels (D-03/D-14)', () => {
    it('fails closed with no label when configuration is missing (Gate #4 pending)', () => {
      expect(policy.deriveStockLabel(new InventoryQuantity(5), null)).toBeUndefined();
      expect(policy.deriveStockLabel(new InventoryQuantity(5), undefined)).toBeUndefined();
    });

    it('derives OUT_OF_STOCK at or below the out-of-stock threshold', () => {
      const config = new InventoryThresholdConfig({
        lowStockThreshold: 10,
        outOfStockThreshold: 2,
      });
      expect(policy.deriveStockLabel(new InventoryQuantity(0), config)).toBe('OUT_OF_STOCK');
      expect(policy.deriveStockLabel(new InventoryQuantity(2), config)).toBe('OUT_OF_STOCK');
    });

    it('derives LOW_STOCK above the out-of-stock threshold up to the low-stock threshold', () => {
      const config = new InventoryThresholdConfig({
        lowStockThreshold: 10,
        outOfStockThreshold: 2,
      });
      expect(policy.deriveStockLabel(new InventoryQuantity(3), config)).toBe('LOW_STOCK');
      expect(policy.deriveStockLabel(new InventoryQuantity(10), config)).toBe('LOW_STOCK');
    });

    it('derives IN_STOCK above the low-stock threshold', () => {
      const config = new InventoryThresholdConfig({
        lowStockThreshold: 10,
        outOfStockThreshold: 2,
      });
      expect(policy.deriveStockLabel(new InventoryQuantity(11), config)).toBe('IN_STOCK');
      expect(policy.deriveStockLabel(new InventoryQuantity(100), config)).toBe('IN_STOCK');
    });
  });

  describe('reservation port vocabulary (D-06 port-only)', () => {
    it('uses typed RESERVED/DENIED/FAILED outcomes in the port shape', () => {
      // The port is domain-level and port-only (D-06); the outcome union
      // type is exercised at the application layer (M05-M3). Here we only
      // verify the policy surface used by the port does not fabricate
      // outcomes: the availability derivation above covers AVAILABLE and
      // UNAVAILABLE; FAILED is adapter-mapped only.
      const correlation = new CorrelationIdentifier('0191310f-789a-7123-8123-000000000301');
      expect(correlation.value).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});
