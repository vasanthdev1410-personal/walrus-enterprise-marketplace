import { InventoryDelta, MAX_MUTATION_UNITS } from './inventory-delta';
import { InventoryQuantity } from './inventory-quantity';
import { isReasonMandatory, INVENTORY_MOVEMENT_TYPES } from './inventory-movement-type';
import {
  availableOutcome,
  failedOutcome,
  unavailableOutcome,
} from './inventory-availability-outcome';
import { InventoryThresholdConfig } from './inventory-threshold-config';
import { INVENTORY_STOCK_LABELS } from './inventory-stock-label';

describe('Inventory value objects (M05-M1, WEMP-M05-SPEC-001 §4/§6/§9/§22)', () => {
  describe('InventoryQuantity (D-02/D-08)', () => {
    it('accepts zero and positive integers', () => {
      expect(new InventoryQuantity(0).value).toBe(0);
      expect(new InventoryQuantity(1_000_000).value).toBe(1_000_000);
    });

    it('rejects negative and non-integer values', () => {
      expect(() => new InventoryQuantity(-1)).toThrow('non-negative safe integer');
      expect(() => new InventoryQuantity(1.5)).toThrow('non-negative safe integer');
      expect(() => new InventoryQuantity(Number.NaN)).toThrow('non-negative safe integer');
      expect(() => new InventoryQuantity(Number.MAX_SAFE_INTEGER + 1)).toThrow(
        'non-negative safe integer',
      );
    });
  });

  describe('InventoryDelta (D-04/D-08)', () => {
    it('accepts positive deltas up to the 1,000,000-unit bound', () => {
      expect(new InventoryDelta(1).value).toBe(1);
      expect(new InventoryDelta(MAX_MUTATION_UNITS).value).toBe(MAX_MUTATION_UNITS);
    });

    it('rejects zero, negative, non-integer, and over-bound deltas', () => {
      expect(() => new InventoryDelta(0)).toThrow('positive safe integer');
      expect(() => new InventoryDelta(-5)).toThrow('positive safe integer');
      expect(() => new InventoryDelta(1.5)).toThrow('positive safe integer');
      expect(() => new InventoryDelta(MAX_MUTATION_UNITS + 1)).toThrow('at most');
    });
  });

  describe('InventoryMovementType (D-04)', () => {
    it('contains exactly the four approved movement types', () => {
      expect(INVENTORY_MOVEMENT_TYPES).toEqual([
        'STOCK_IN',
        'STOCK_OUT',
        'ADJUSTMENT',
        'COUNT_CORRECTION',
      ]);
    });

    it('mandates a reason reference on outward/correction movements only (D-08)', () => {
      expect(isReasonMandatory('STOCK_IN')).toBe(false);
      expect(isReasonMandatory('STOCK_OUT')).toBe(true);
      expect(isReasonMandatory('ADJUSTMENT')).toBe(true);
      expect(isReasonMandatory('COUNT_CORRECTION')).toBe(true);
    });
  });

  describe('InventoryAvailabilityOutcome (D-03/D-10)', () => {
    it('builds each outcome shape', () => {
      expect(availableOutcome(5)).toEqual({ status: 'AVAILABLE', availableQuantity: 5 });
      expect(unavailableOutcome()).toEqual({ status: 'UNAVAILABLE' });
      expect(failedOutcome('internal')).toEqual({ status: 'FAILED', reason: 'internal' });
    });

    it('never fabricates FAILED as an availability fact', () => {
      // FAILED exists only for adapter error mapping; the domain derives
      // only AVAILABLE/UNAVAILABLE (enforced by InventoryStockPolicy tests).
      expect(failedOutcome('x').status).toBe('FAILED');
    });
  });

  describe('InventoryThresholdConfig (D-14)', () => {
    it('accepts valid threshold pairs', () => {
      const config = new InventoryThresholdConfig({
        lowStockThreshold: 10,
        outOfStockThreshold: 0,
      });
      expect(config.properties).toEqual({
        lowStockThreshold: 10,
        outOfStockThreshold: 0,
      });
      expect(
        new InventoryThresholdConfig({ lowStockThreshold: 0, outOfStockThreshold: 0 }),
      ).toBeDefined();
    });

    it('rejects negative or non-integer thresholds (fail closed, D-14)', () => {
      expect(
        () => new InventoryThresholdConfig({ lowStockThreshold: -1, outOfStockThreshold: 0 }),
      ).toThrow('Low-stock threshold must be a non-negative safe integer');
      expect(
        () => new InventoryThresholdConfig({ lowStockThreshold: 10, outOfStockThreshold: -1 }),
      ).toThrow('Out-of-stock threshold must be a non-negative safe integer');
      expect(
        () => new InventoryThresholdConfig({ lowStockThreshold: 1.5, outOfStockThreshold: 0 }),
      ).toThrow();
    });

    it('rejects an out-of-stock threshold above the low-stock threshold', () => {
      expect(
        () => new InventoryThresholdConfig({ lowStockThreshold: 5, outOfStockThreshold: 6 }),
      ).toThrow('Out-of-stock threshold must not exceed the low-stock threshold');
    });
  });

  describe('InventoryStockLabel (D-03/D-14)', () => {
    it('defines the three derived labels', () => {
      expect(INVENTORY_STOCK_LABELS).toEqual(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']);
    });
  });
});
