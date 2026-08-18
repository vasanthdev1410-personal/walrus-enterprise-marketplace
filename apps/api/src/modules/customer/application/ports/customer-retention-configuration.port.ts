import type { CustomerRetentionRule } from '../../domain/policy/customer-retention.policy';

/**
 * WEMP-M06-SPEC-001 §19 (decision D-15). Centrally configurable
 * record-retention rules keyed by record category. The configuration source
 * (environment, config file) is the single point of control; business logic
 * never hard-codes retention durations. A category with no resolvable rule
 * fails closed — the retention processor must not delete records it cannot
 * classify (D-15: no deletion without a valid configured duration). Mirrors
 * the Module 05 `InventoryRetentionConfigurationPort` precedent.
 */
export interface CustomerRetentionConfigurationPort {
  /** Resolves the retention rule for a category, or undefined when unconfigured. */
  findRule(category: string): Promise<CustomerRetentionRule | undefined>;
}
