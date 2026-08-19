import type { CartRetentionRule } from '../../domain/policy/cart-retention.policy';

/**
 * WEMP-M07-SPEC-001 (decision D-11). The retention configuration port for
 * Module 07. Returns the record-retention rules keyed by record category.
 * The configuration source is centrally configurable per environment; fail
 * closed when unconfigured.
 */
export interface CartRetentionConfigurationPort {
  /** Resolves the retention rule for a category, or undefined when unconfigured. */
  resolveRule(category: string): CartRetentionRule | undefined;
}
