import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { AggregateVersion as AggregateVersionValue } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { InventoryMovementRecord } from '../entities/inventory-movement-record';
import { StockPool } from '../entities/stock-pool';
import { InventoryDomainError } from '../errors/inventory-domain.error';
import { InventoryDelta } from '../value-objects/inventory-delta';
import {
  availableOutcome,
  type InventoryAvailabilityOutcome,
  unavailableOutcome,
} from '../value-objects/inventory-availability-outcome';
import {
  INVENTORY_MOVEMENT_TYPES,
  isReasonMandatory,
  type InventoryMovementType,
} from '../value-objects/inventory-movement-type';
import { InventoryQuantity } from '../value-objects/inventory-quantity';
import type { DerivedStockLabel } from '../value-objects/inventory-stock-label';
import type { InventoryThresholdConfig } from '../value-objects/inventory-threshold-config';

/**
 * WEMP-M05-SPEC-001 §4–§9 (decisions D-01, D-02, D-03, D-04, D-06, D-07,
 * D-08, D-14). Aggregate-level inventory policy: typed delta application,
 * version-checked reserve/release, derived availability, and derived
 * low/out-of-stock labels. Pure and deterministic; every rule fails
 * closed with a typed InventoryDomainError. Mirrors the Module 03/04
 * policy pattern.
 */

/** Direction of an ADJUSTMENT movement (STOCK_IN/STOCK_OUT have fixed direction). */
export type AdjustmentDirection = 'INCREASE' | 'DECREASE';

export interface InventoryMovementCommand {
  readonly pool: StockPool;
  readonly movementType: InventoryMovementType;
  /** Positive magnitude (D-08: per-event delta > 0; ≤ 1,000,000 units). */
  readonly delta: InventoryDelta;
  /** Required for ADJUSTMENT; must be omitted for STOCK_IN/STOCK_OUT. */
  readonly direction?: AdjustmentDirection;
  /** Target on-hand for COUNT_CORRECTION; the recorded delta is derived as |target − onHand|. */
  readonly targetOnHand?: InventoryQuantity;
  /** Optimistic-concurrency guard (D-07): must equal the pool's current version. */
  readonly expectedVersion: AggregateVersion;
  readonly actorIdentityId: UuidV7;
  readonly movementId: UuidV7;
  /** Mandatory on STOCK_OUT/ADJUSTMENT/COUNT_CORRECTION (D-08); non-disclosing. */
  readonly reasonReference?: string;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly occurredAt: Date;
}

export interface InventoryMovementResult {
  readonly updatedPool: StockPool;
  readonly movementRecord: InventoryMovementRecord;
}

export interface InventoryReserveCommand {
  readonly pool: StockPool;
  /** Quantity to reserve: ≥ 1 and ≤ available (D-06/D-08). */
  readonly quantity: InventoryDelta;
  readonly expectedVersion: AggregateVersion;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly occurredAt: Date;
}

export interface InventoryReleaseCommand {
  readonly pool: StockPool;
  /** Quantity to release: ≥ 1 and ≤ reserved; release never goes below zero (D-06). */
  readonly quantity: InventoryDelta;
  readonly expectedVersion: AggregateVersion;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly occurredAt: Date;
}

export class InventoryStockPolicy {
  /**
   * WEMP-M05-SPEC-001 §6/§8/§9 (decisions D-04, D-07, D-08). Applies a
   * typed movement as a delta to the pool and returns the version-guarded
   * updated pool plus the append-only ledger record. Denies (fail closed)
   * on: stale version, delta over the 1,000,000-unit bound (guaranteed by
   * InventoryDelta), a movement that would make available negative (D-02),
   * missing mandatory reason (D-08), direction missing on ADJUSTMENT or
   * present on STOCK_IN/STOCK_OUT, a COUNT_CORRECTION with no target or an
   * unchanged target (zero delta), and any unknown movement type.
   */
  public applyMovement(command: InventoryMovementCommand): InventoryMovementResult {
    this.assertVersion(command.pool, command.expectedVersion);
    this.assertMovementCommandShape(command);

    const onHand = command.pool.properties.onHand.value;
    const reserved = command.pool.properties.reserved.value;
    let resultingOnHand: number;
    let recordedDelta = command.delta.value;

    switch (command.movementType) {
      case 'STOCK_IN':
        resultingOnHand = onHand + command.delta.value;
        break;
      case 'STOCK_OUT':
        resultingOnHand = onHand - command.delta.value;
        break;
      case 'ADJUSTMENT': {
        const direction = command.direction;
        if (direction === undefined) {
          throw new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN');
        }
        resultingOnHand =
          direction === 'INCREASE' ? onHand + command.delta.value : onHand - command.delta.value;
        break;
      }
      case 'COUNT_CORRECTION': {
        const target = command.targetOnHand?.value;
        if (target === undefined) {
          throw new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN');
        }
        if (target === onHand) {
          throw new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN');
        }
        recordedDelta = Math.abs(target - onHand);
        new InventoryDelta(recordedDelta); // enforces the ≤ 1,000,000-unit bound, fail closed
        resultingOnHand = target;
        break;
      }
      default:
        throw new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN');
    }

    this.assertResultingQuantities(resultingOnHand, reserved);

    const updatedPool = this.updatedPool(
      command.pool,
      resultingOnHand,
      reserved,
      command.occurredAt,
    );
    const movementRecord = new InventoryMovementRecord({
      movementId: command.movementId,
      stockPoolId: command.pool.properties.stockPoolId,
      movementType: command.movementType,
      delta: recordedDelta,
      resultingOnHand,
      resultingReserved: reserved,
      actorIdentityId: command.actorIdentityId,
      ...(command.reasonReference !== undefined
        ? { reasonReference: command.reasonReference }
        : {}),
      ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
      ...(command.causationId !== undefined ? { causationId: command.causationId } : {}),
      aggregateVersion: updatedPool.properties.aggregateVersion,
      occurredAt: command.occurredAt,
      createdAt: command.occurredAt,
    });

    return { updatedPool, movementRecord };
  }

  /**
   * WEMP-M05-SPEC-001 §7/§9 (decisions D-06, D-07, D-08). Domain-level,
   * version-checked reserve: raises `reserved` (derived `available` falls).
   * Denied (fail closed) on stale version, quantity < 1 (guaranteed by
   * InventoryDelta), or quantity exceeding available. No reservation
   * record exists in Phase 1 (D-06 — port only); returns the updated pool.
   */
  public reserve(command: InventoryReserveCommand): StockPool {
    this.assertVersion(command.pool, command.expectedVersion);
    const available = command.pool.available.value;
    if (command.quantity.value > available) {
      throw new InventoryDomainError('INVENTORY_RESERVE_EXCEEDS_AVAILABLE');
    }
    const resultingReserved = command.pool.properties.reserved.value + command.quantity.value;
    return this.updatedPool(
      command.pool,
      command.pool.properties.onHand.value,
      resultingReserved,
      command.occurredAt,
    );
  }

  /**
   * WEMP-M05-SPEC-001 §7/§9 (decisions D-06, D-07, D-08). Domain-level,
   * version-checked release: lowers `reserved`; never goes below zero.
   * Denied (fail closed) on stale version or quantity exceeding reserved.
   */
  public release(command: InventoryReleaseCommand): StockPool {
    this.assertVersion(command.pool, command.expectedVersion);
    const reserved = command.pool.properties.reserved.value;
    if (command.quantity.value > reserved) {
      throw new InventoryDomainError('INVENTORY_RELEASE_EXCEEDS_RESERVED');
    }
    const resultingReserved = reserved - command.quantity.value;
    return this.updatedPool(
      command.pool,
      command.pool.properties.onHand.value,
      resultingReserved,
      command.occurredAt,
    );
  }

  /**
   * WEMP-M05-SPEC-001 §5/§11 (decisions D-03, D-10). Derives the
   * availability outcome from the pool and the Module 04 SKU fact. Fail
   * closed: null/absent pool or a non-consumable (unknown/non-PUBLISHED)
   * SKU resolves to UNAVAILABLE; `available > 0` resolves to AVAILABLE;
   * `available ≤ 0` resolves to UNAVAILABLE. FAILED is never fabricated
   * here — adapters map internal errors to FAILED non-disclosingly.
   */
  public deriveAvailability(
    pool: StockPool | null,
    skuConsumable: boolean,
  ): InventoryAvailabilityOutcome {
    if (pool === null || !skuConsumable) {
      return unavailableOutcome();
    }
    const available = pool.available.value;
    if (available <= 0) {
      return unavailableOutcome();
    }
    return availableOutcome(available);
  }

  /**
   * WEMP-M05-SPEC-001 §5/§22 (decisions D-03, D-14). Derives the
   * read-model stock label from the available quantity and the configured
   * thresholds. Fail closed (D-14): no label is derived — returns
   * `undefined` — when the threshold configuration is missing or invalid;
   * label enforcement requires valid configured values (Gate #4: values
   * pending authority input; nothing is hard-coded here).
   */
  public deriveStockLabel(
    available: InventoryQuantity,
    config: InventoryThresholdConfig | null | undefined,
  ): DerivedStockLabel {
    if (config === null || config === undefined) {
      return undefined;
    }
    const value = available.value;
    if (value <= config.properties.outOfStockThreshold) {
      return 'OUT_OF_STOCK';
    }
    if (value <= config.properties.lowStockThreshold) {
      return 'LOW_STOCK';
    }
    return 'IN_STOCK';
  }

  public isKnownMovementType(value: string): value is InventoryMovementType {
    return (INVENTORY_MOVEMENT_TYPES as readonly string[]).includes(value);
  }

  private assertVersion(pool: StockPool, expectedVersion: AggregateVersion): void {
    if (pool.properties.aggregateVersion.value !== expectedVersion.value) {
      throw new InventoryDomainError('INVENTORY_VERSION_CONFLICT');
    }
  }

  private assertMovementCommandShape(command: InventoryMovementCommand): void {
    if (!this.isKnownMovementType(command.movementType)) {
      throw new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN');
    }
    if (isReasonMandatory(command.movementType)) {
      if (command.reasonReference === undefined || command.reasonReference.trim().length === 0) {
        throw new InventoryDomainError('INVENTORY_REASON_REQUIRED');
      }
    }
    if (command.movementType === 'ADJUSTMENT' && command.direction === undefined) {
      throw new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN');
    }
    if (command.movementType !== 'ADJUSTMENT' && command.direction !== undefined) {
      throw new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN');
    }
    if (command.movementType === 'COUNT_CORRECTION' && command.targetOnHand === undefined) {
      throw new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN');
    }
    if (command.movementType !== 'COUNT_CORRECTION' && command.targetOnHand !== undefined) {
      throw new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN');
    }
  }

  private assertResultingQuantities(resultingOnHand: number, resultingReserved: number): void {
    if (resultingOnHand < 0) {
      throw new InventoryDomainError('INVENTORY_NEGATIVE_AVAILABLE');
    }
    if (resultingReserved > resultingOnHand) {
      throw new InventoryDomainError('INVENTORY_NEGATIVE_AVAILABLE');
    }
  }

  private updatedPool(
    pool: StockPool,
    onHand: number,
    reserved: number,
    occurredAt: Date,
  ): StockPool {
    const properties = pool.properties;
    return new StockPool({
      ...properties,
      onHand: new InventoryQuantity(onHand),
      reserved: new InventoryQuantity(reserved),
      aggregateVersion: new AggregateVersionValue(properties.aggregateVersion.value + 1),
      updatedAt: occurredAt,
    });
  }
}
