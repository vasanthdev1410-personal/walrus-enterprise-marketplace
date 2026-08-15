import type { InventoryRetentionRule } from '../../domain/policy/inventory-retention.policy';

/**
 * WEMP-M05-SPEC-001 §21 (decision D-12). Centrally configurable
 * evidence-retention rules keyed by record category. The configuration
 * source (environment, config file) is the single point of control;
 * business logic never hard-codes retention durations. A category with no
 * resolvable rule fails closed — the retention processor must not delete
 * evidence it cannot classify (D-12: no deletion without a valid
 * configured duration). Mirrors the Module 03
 * `EvidenceRetentionConfigurationPort` precedent.
 */
export interface InventoryRetentionConfigurationPort {
  /** Resolves the retention rule for a category, or undefined when unconfigured. */
  findRule(category: string): Promise<InventoryRetentionRule | undefined>;
}
