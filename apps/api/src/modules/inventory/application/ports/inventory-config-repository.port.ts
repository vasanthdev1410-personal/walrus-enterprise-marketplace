import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { InventoryThresholdConfig } from '../../domain/value-objects/inventory-threshold-config';

/**
 * WEMP-M05-SPEC-001 §22 (decision D-14; values RECORDED 2026-08-15). The
 * writable platform-defined, admin-managed low/out-of-stock threshold
 * configuration stored in `inventory_config_records`. Business logic never
 * hard-codes threshold values; this repository is the single source of
 * truth for the admin config surface (GET/PATCH) and, through its
 * `findThresholdConfig` read, for label derivation. Fail closed: a missing
 * row set, a partial set, or an invalid value resolves to undefined — never
 * a fabricated configuration (D-14).
 */
export interface InventoryThresholdConfigSnapshot {
  readonly config: InventoryThresholdConfig;
  /** Optimistic concurrency version (max row aggregateVersion); 0 when unconfigured. */
  readonly version: number;
}

export interface SaveInventoryThresholdConfigCommand {
  readonly lowStockThreshold: number;
  readonly outOfStockThreshold: number;
  /** Must equal the current snapshot version (0 = initial configuration, D-14). */
  readonly expectedVersion: number;
  readonly changedByIdentityId: UuidV7;
  readonly now: Date;
}

export interface InventoryConfigRepository {
  /** Resolves the threshold configuration, or undefined when unconfigured/invalid (fail closed). */
  findThresholdConfig(): Promise<InventoryThresholdConfig | undefined>;
  /** Resolves the configuration together with its optimistic version. */
  findThresholdConfigSnapshot(): Promise<InventoryThresholdConfigSnapshot | undefined>;
  /** Version-checked upsert of both threshold rows; throws INVENTORY_STATE_CONFLICT on a stale version. */
  saveThresholdConfig(
    command: SaveInventoryThresholdConfigCommand,
  ): Promise<InventoryThresholdConfigSnapshot>;
}
