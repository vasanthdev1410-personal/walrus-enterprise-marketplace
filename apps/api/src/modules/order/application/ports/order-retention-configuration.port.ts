import type { OrderRetentionRule } from '../../domain/policy/order-retention.policy';

/**
 * WEMP-M08-SPEC-001 (decision D-07). The retention configuration port for
 * Module 08. Returns the record-retention rules keyed by record category.
 * The configuration source is centrally configurable per environment; fail
 * closed when unconfigured.
 */
export interface OrderRetentionConfigurationPort {
  /** Resolves the retention rule for a category, or undefined when unconfigured. */
  resolveRule(category: string): OrderRetentionRule | undefined;
}
