import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { InventoryAuditRecord } from '../../domain/entities/inventory-audit-record';
import { StockPool } from '../../domain/entities/stock-pool';
import type { InventoryStockPolicy } from '../../domain/policy/inventory-stock-policy';
import type { AdjustmentDirection } from '../../domain/policy/inventory-stock-policy';
import type { InventoryStockPoolRepository } from '../../domain/ports/inventory-repository.port';
import type { Module02InventoryAuthorizationContractPort } from '../../domain/ports/module-02-authorization.port';
import type {
  Module04ProductCatalogReadPort,
  Module04SkuFacts,
} from '../../domain/ports/module-04-product-catalog.port';
import { InventoryDelta } from '../../domain/value-objects/inventory-delta';
import type { InventoryMovementType } from '../../domain/value-objects/inventory-movement-type';
import { InventoryQuantity } from '../../domain/value-objects/inventory-quantity';
import type { InventoryAdminAuthorizationPort } from '../ports/inventory-admin-authorization.port';
import { InventoryApplicationError } from '../errors/inventory-application.error';

/**
 * WEMP-M05-PLAN-001 M05-M3 (WEMP-M05-SPEC-001 §6/§8/§9/§11/§13, decisions
 * D-04, D-05, D-07, D-08, D-10, D-15). Inventory mutation application
 * service.
 *
 * - `adjustStock`: seller self-service adjustment (STOCK_IN / STOCK_OUT /
 *   ADJUSTMENT) for the caller's own seller organization. Owner-only
 *   (MEMBER read-only — D-05); SKU must exist, belong to the caller's
 *   seller organization, and be PUBLISHED (D-08/D-10, Module 04 contract
 *   fact, fail closed); version-checked (D-07); mandatory reason on
 *   STOCK_OUT/ADJUSTMENT (D-08); idempotent (A-11); rate-limited (D-11:
 *   seller adjustments 30/hour — RECORDED 2026-08-15).
 * - `adminCorrectStock`: administrative correction (COUNT_CORRECTION) by
 *   an explicitly granted administrator (`inventory.adjust.admin` — D-05,
 *   fail closed, no hidden override); mandatory reason (D-08);
 *   version-checked; idempotent; rate-limited (D-11: admin corrections
 *   50/hour).
 *
 * Every mutation runs through the repository `mutate` path: a single
 * transaction with the PostgreSQL row lock (SELECT … FOR UPDATE) on the
 * pool row, policy apply, then pool + append-only ledger/audit write —
 * any failure rolls back fully (D-07). Pool activation on first recorded
 * movement (D-15) appends a `POOL_ACTIVATED` audit event; normal
 * movements append only the ledger record (D-09).
 *
 * Cross-module facts (SKU existence/PUBLISHED state, seller association)
 * arrive exclusively through the approved ports — Module 05 never reads
 * Module 04/03 storage (A-06). Until M05-M4 wires the real adapters the
 * production wiring fails closed (deny), which this service relies on.
 */
export class InventoryApplicationService {
  public constructor(
    private readonly repository: InventoryStockPoolRepository,
    private readonly module02: Module02InventoryAuthorizationContractPort,
    private readonly module04: Module04ProductCatalogReadPort,
    private readonly adminAuthorization: InventoryAdminAuthorizationPort,
    private readonly policy: InventoryStockPolicy,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly idempotency: ApiIdempotencyService,
    private readonly rateLimiter: NonProductionRateLimiterPort,
  ) {}

  /** WEMP-M05-SPEC-001 §15. Seller stock adjustment (owner-only, D-05). */
  public async adjustStock(command: SellerAdjustmentCommand): Promise<InventoryMutationResult> {
    // D-11 (recorded 2026-08-15): seller inventory adjustments 30/hour.
    const rateLimit = await this.rateLimiter.consume({
      key: `inventory-adjust:${command.actorIdentityId.value}`,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new InventoryApplicationError('INVENTORY_RATE_LIMITED');
    }
    // D-05: management actions resolve the ACTIVE OWNER association; MEMBER
    // associations are read-only. Fail closed on any missing association.
    await this.assertOwner(command.actorIdentityId, command.sellerProfileId);
    // D-08/D-10: the SKU must exist in Module 04, belong to the caller's
    // seller organization, and be PUBLISHED (consumable fact). Fail closed.
    await this.assertConsumableSku(command.skuId, command.sellerProfileId);
    // A-11: idempotency key mandatory on all mutations.
    return this.idempotency.execute<InventoryMutationResult>({
      scope: `inventory:${command.skuId.value}`,
      operationType: 'inventory.adjust',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const result = await this.applyMovement(command.skuId, command.expectedVersion, now, {
          movementType: command.movementType,
          ...(command.direction !== undefined ? { direction: command.direction } : {}),
          delta: command.delta,
          actorIdentityId: command.actorIdentityId,
          sellerProfileId: command.sellerProfileId,
          ...(command.reasonReference !== undefined
            ? { reasonReference: command.reasonReference }
            : {}),
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        return {
          skuId: command.skuId.value,
          onHand: result.onHand,
          reserved: result.reserved,
          available: result.available,
          version: result.version,
        };
      },
    });
  }

  /** WEMP-M05-SPEC-001 §15. Administrative correction (D-04/D-05/D-08). */
  public async adminCorrectStock(
    command: AdminCorrectionCommand,
  ): Promise<InventoryMutationResult> {
    // D-11 (recorded 2026-08-15): admin corrections 50/hour.
    const rateLimit = await this.rateLimiter.consume({
      key: `inventory-admin:${command.actorIdentityId.value}`,
      limit: 50,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new InventoryApplicationError('INVENTORY_RATE_LIMITED');
    }
    // D-05: explicit administrative grant; no hidden override. Fail closed.
    const granted = await this.adminAuthorization.isGranted(
      command.actorIdentityId,
      'inventory.adjust.admin',
    );
    if (!granted) {
      throw new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED');
    }
    // D-08: the SKU must exist in Module 04 and be PUBLISHED (fail closed).
    // The authoritative seller scope comes from the SKU fact, never from a
    // client claim (A-02) — used for pool creation on activation (D-15).
    const fact = await this.assertConsumableSkuForAdmin(command.skuId);
    return this.idempotency.execute<InventoryMutationResult>({
      scope: `inventory:${command.skuId.value}`,
      operationType: 'inventory.correct',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = this.clock.now();
        const result = await this.applyMovement(command.skuId, command.expectedVersion, now, {
          movementType: 'COUNT_CORRECTION',
          targetOnHand: command.targetOnHand,
          // Placeholder only — the policy derives the recorded delta from
          // the target for COUNT_CORRECTION (M05-M1 approved command shape).
          delta: new InventoryDelta(1),
          actorIdentityId: command.actorIdentityId,
          sellerProfileId: fact.sellerProfileId,
          reasonReference: command.reasonReference,
          ...(command.correlationId !== undefined ? { correlationId: command.correlationId } : {}),
        });
        return {
          skuId: command.skuId.value,
          onHand: result.onHand,
          reserved: result.reserved,
          available: result.available,
          version: result.version,
        };
      },
    });
  }

  /**
   * WEMP-M05-SPEC-001 §8/§13 (decisions D-07, D-15). Runs the mutation
   * through the repository's single-transaction row-locked path. The
   * callback receives the locked pool (null on first movement — D-15 pool
   * activation) and builds the change set by applying the policy; the
   * version is asserted inside the transaction, so a concurrent mutation
   * fails closed without partial writes.
   */
  private async applyMovement(
    skuId: UuidV7,
    expectedVersion: number,
    now: Date,
    movement: {
      movementType: InventoryMovementType;
      direction?: AdjustmentDirection;
      /**
       * Positive magnitude. The domain command requires a delta on every
       * movement; for COUNT_CORRECTION the policy derives the recorded
       * delta from the target and ignores this placeholder (mirrors the
       * M05-M1 spec's movement-command default).
       */
      delta: InventoryDelta;
      targetOnHand?: InventoryQuantity;
      actorIdentityId: UuidV7;
      sellerProfileId: UuidV7;
      reasonReference?: string;
      correlationId?: CorrelationIdentifier;
    },
  ): Promise<{ onHand: number; reserved: number; available: number; version: number }> {
    let snapshot: { onHand: number; reserved: number; available: number; version: number } = {
      onHand: 0,
      reserved: 0,
      available: 0,
      version: 0,
    };
    await this.repository.mutate(skuId, (pool) => {
      if (pool === null) {
        // D-15: pool activation on first recorded movement. Activation
        // requires the caller to expect no pool (expectedVersion 0) — a
        // claim that a pool exists when none does is a state conflict.
        if (expectedVersion !== 0) {
          throw new InventoryApplicationError('INVENTORY_STATE_CONFLICT');
        }
        const initial = new StockPool({
          stockPoolId: this.identifiers.next(),
          skuId,
          sellerProfileId: movement.sellerProfileId,
          onHand: new InventoryQuantity(0),
          reserved: new InventoryQuantity(0),
          aggregateVersion: new AggregateVersion(1),
          createdAt: now,
          updatedAt: now,
        });
        const applied = this.policy.applyMovement({
          pool: initial,
          movementType: movement.movementType,
          expectedVersion: new AggregateVersion(1),
          ...(movement.direction !== undefined ? { direction: movement.direction } : {}),
          delta: movement.delta,
          ...(movement.targetOnHand !== undefined ? { targetOnHand: movement.targetOnHand } : {}),
          actorIdentityId: movement.actorIdentityId,
          movementId: this.identifiers.next(),
          ...(movement.reasonReference !== undefined
            ? { reasonReference: movement.reasonReference }
            : {}),
          ...(movement.correlationId !== undefined
            ? { correlationId: movement.correlationId }
            : {}),
          occurredAt: now,
        });
        const audit = new InventoryAuditRecord({
          auditEventId: this.identifiers.next(),
          stockPoolId: applied.updatedPool.properties.stockPoolId,
          eventType: 'POOL_ACTIVATED',
          actorIdentityId: movement.actorIdentityId,
          occurredAt: now,
          createdAt: now,
          ...(movement.correlationId !== undefined
            ? { correlationId: movement.correlationId }
            : {}),
        });
        snapshot = this.snapshotOf(applied.updatedPool);
        return {
          pool: applied.updatedPool,
          movementsToAppend: [applied.movementRecord],
          auditRecordsToAppend: [audit],
        };
      }
      // Existing pool: optimistic version check (D-07) inside the locked
      // transaction — a stale claim conflicts and rolls back cleanly.
      if (pool.properties.aggregateVersion.value !== expectedVersion) {
        throw new InventoryApplicationError('INVENTORY_STATE_CONFLICT');
      }
      const applied = this.policy.applyMovement({
        pool,
        movementType: movement.movementType,
        expectedVersion: pool.properties.aggregateVersion,
        ...(movement.direction !== undefined ? { direction: movement.direction } : {}),
        delta: movement.delta,
        ...(movement.targetOnHand !== undefined ? { targetOnHand: movement.targetOnHand } : {}),
        actorIdentityId: movement.actorIdentityId,
        movementId: this.identifiers.next(),
        ...(movement.reasonReference !== undefined
          ? { reasonReference: movement.reasonReference }
          : {}),
        ...(movement.correlationId !== undefined ? { correlationId: movement.correlationId } : {}),
        occurredAt: now,
      });
      snapshot = this.snapshotOf(applied.updatedPool);
      return {
        pool: applied.updatedPool,
        movementsToAppend: [applied.movementRecord],
        auditRecordsToAppend: [],
      };
    });
    return snapshot;
  }

  private snapshotOf(pool: StockPool): {
    onHand: number;
    reserved: number;
    available: number;
    version: number;
  } {
    return {
      onHand: pool.properties.onHand.value,
      reserved: pool.properties.reserved.value,
      available: pool.available.value,
      version: pool.properties.aggregateVersion.value,
    };
  }

  /** D-05: management requires the ACTIVE OWNER association (MEMBER read-only). */
  private async assertOwner(actorIdentityId: UuidV7, sellerProfileId: UuidV7): Promise<void> {
    const association = await this.module02.resolveActiveAssociation(
      actorIdentityId,
      sellerProfileId,
    );
    if (association?.associationState !== 'ACTIVE' || association.associationRole !== 'OWNER') {
      throw new InventoryApplicationError('INVENTORY_OWNERSHIP_DENIED');
    }
  }

  /**
   * D-08/D-10 (seller flow): the SKU must exist in Module 04, belong to the
   * caller's seller organization, and be PUBLISHED. Fail closed on unknown,
   * non-PUBLISHED, other-organization, or CLOSED SKUs (D-15).
   */
  private async assertConsumableSku(skuId: UuidV7, sellerProfileId: UuidV7): Promise<void> {
    const fact = await this.module04.getConsumableSkuFact(skuId);
    if (fact === null) {
      throw new InventoryApplicationError('INVENTORY_SKU_UNAVAILABLE');
    }
    if (fact.sellerProfileId.value !== sellerProfileId.value) {
      throw new InventoryApplicationError('INVENTORY_OWNERSHIP_DENIED');
    }
    if (fact.state !== 'ACTIVE') {
      // D-15: a CLOSED SKU's pool is read-only for quantity mutations.
      throw new InventoryApplicationError('INVENTORY_STATE_CONFLICT');
    }
  }

  /**
   * D-08 (admin flow): the SKU must exist in Module 04 and be PUBLISHED.
   * Fail closed on unknown/non-PUBLISHED SKUs (D-08) and on CLOSED SKUs
   * (D-15 read-only). Returns the fact so the caller uses the authoritative
   * seller scope for pool creation (never a client claim — A-02).
   */
  private async assertConsumableSkuForAdmin(skuId: UuidV7): Promise<Module04SkuFacts> {
    const fact = await this.module04.getConsumableSkuFact(skuId);
    if (fact === null) {
      throw new InventoryApplicationError('INVENTORY_SKU_UNAVAILABLE');
    }
    if (fact.state !== 'ACTIVE') {
      throw new InventoryApplicationError('INVENTORY_STATE_CONFLICT');
    }
    return fact;
  }
}

export interface SellerAdjustmentCommand {
  readonly sellerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly skuId: UuidV7;
  /** Seller self-service movement types (D-04; COUNT_CORRECTION is admin-only, §15). */
  readonly movementType: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';
  /** Positive magnitude; ≤ 1,000,000 units (D-08). */
  readonly delta: InventoryDelta;
  /** Required for ADJUSTMENT (INCREASE/DECREASE). */
  readonly direction?: AdjustmentDirection;
  /** Optimistic concurrency guard (D-07); 0 = activation (no pool yet, D-15). */
  readonly expectedVersion: number;
  /** Mandatory on STOCK_OUT/ADJUSTMENT (D-08); non-disclosing. */
  readonly reasonReference?: string;
  /** Caller-supplied idempotency key — mandatory (A-11). */
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface AdminCorrectionCommand {
  readonly actorIdentityId: UuidV7;
  readonly skuId: UuidV7;
  /** COUNT_CORRECTION target on-hand quantity (D-04/D-18, direct operation). */
  readonly targetOnHand: InventoryQuantity;
  /** Optimistic concurrency guard (D-07); 0 = activation (no pool yet, D-15). */
  readonly expectedVersion: number;
  /** Mandatory on admin corrections (D-08); non-disclosing. */
  readonly reasonReference: string;
  /** Caller-supplied idempotency key — mandatory (A-11). */
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

export interface InventoryMutationResult {
  readonly skuId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly version: number;
}
