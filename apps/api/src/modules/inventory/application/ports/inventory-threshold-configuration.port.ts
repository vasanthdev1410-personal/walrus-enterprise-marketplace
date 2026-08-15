import type { InventoryThresholdConfig } from '../../domain/value-objects/inventory-threshold-config';

/**
 * WEMP-M05-SPEC-001 §22 (decision D-14; values RECORDED 2026-08-15).
 * Resolves the platform-defined, admin-managed low/out-of-stock threshold
 * configuration used for derived read-model labels. Fail closed: no label
 * is enforced when the configuration is missing or invalid (D-14). The
 * configuration source (environment, config file, or the
 * `inventory_config_records` table) is the single point of control;
 * business logic never hard-codes threshold values.
 */
export interface InventoryThresholdConfigurationPort {
  /** Resolves the threshold configuration, or undefined when unconfigured/invalid. */
  findThresholdConfig(): Promise<InventoryThresholdConfig | undefined>;
}
