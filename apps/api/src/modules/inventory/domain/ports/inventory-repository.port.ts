import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { InventoryAuditRecord } from '../entities/inventory-audit-record';
import type { InventoryMovementRecord } from '../entities/inventory-movement-record';
import type { StockPool } from '../entities/stock-pool';

/**
 * WEMP-M05-PLAN-001 M05-M2. Module 05-owned inventory aggregate
 * repository (implemented over Prisma at M05-M2). All quantity mutations
 * are atomic change sets guarded by the aggregate version (D-07:
 * optimistic guard + PostgreSQL row lock, one transaction per mutation);
 * a stale version throws without mutating any state. `skuId` and
 * `sellerProfileId` are logical UUIDv7 references — the repository never
 * reads Module 04/03 storage (A-06) and no cross-module foreign keys
 * exist. Append-only movement/audit records are committed atomically with
 * the pool mutation that produced them (D-09).
 */
export interface InventoryAggregateChangeSet {
  readonly pool: StockPool;
  /** Append-only primary quantity ledger records (D-09), committed with the pool. */
  readonly movementsToAppend: readonly InventoryMovementRecord[];
  /** Append-only secondary business audit records (D-09), committed with the pool. */
  readonly auditRecordsToAppend: readonly InventoryAuditRecord[];
}

export interface InventoryStockPoolRepository {
  /** Finds the single per-SKU pool, or null when no pool exists yet. */
  findBySkuId(skuId: UuidV7): Promise<StockPool | null>;
  /** Finds the pool rows for a seller organization (non-enumerating scoping). */
  findBySeller(sellerProfileId: UuidV7): Promise<readonly StockPool[]>;
  /**
   * Finds all pool rows for admin inspection (WEMP-M05-SPEC-001 §15, gated
   * on the approved `inventory.audit.view` grant at the application layer).
   */
  findAll(): Promise<readonly StockPool[]>;
  /**
   * D-07 single-transaction mutation path: acquires the PostgreSQL
   * pessimistic row lock (`SELECT … FOR UPDATE`) on the pool row, loads the
   * pool, runs the mutation callback (which applies the domain policy and
   * builds the change set), then commits pool + appended evidence atomically
   * (load → validate → apply → write → commit; any failure rolls back fully).
   * The callback receives the locked pool, or null when no pool exists yet
   * (D-15 activation on first recorded movement).
   */
  mutate(
    skuId: UuidV7,
    mutate: (
      pool: StockPool | null,
    ) => InventoryAggregateChangeSet | Promise<InventoryAggregateChangeSet>,
  ): Promise<void>;
  /**
   * Inserts a new pool with its first movement/audit records atomically
   * (D-15 pool activation on first recorded movement). Fails closed when a
   * pool for the SKU already exists (one pool per SKU per seller scope, D-01).
   */
  insert(changeSet: InventoryAggregateChangeSet): Promise<void>;
  /**
   * Version-guarded save of the pool plus its appended movement/audit
   * records, executed atomically. Throws an optimistic-concurrency error
   * when the stored version no longer matches expectedVersion (D-07).
   */
  save(changeSet: InventoryAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
}

/**
 * Append-only ledger/audit read surface (D-09). Reads only; no update or
 * delete API exists (append-only semantics, D-09). Implemented at M05-M2.
 */
export interface InventoryEvidenceReadRepository {
  /** Returns the movement ledger for a pool in recorded order (oldest first). */
  findMovements(stockPoolId: UuidV7): Promise<readonly InventoryMovementRecord[]>;
  /** Returns the business audit records for a pool in recorded order (oldest first). */
  findAuditRecords(stockPoolId: UuidV7): Promise<readonly InventoryAuditRecord[]>;
}
