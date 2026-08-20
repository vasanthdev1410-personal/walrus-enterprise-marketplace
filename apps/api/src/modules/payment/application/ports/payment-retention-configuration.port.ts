import type { PaymentRetentionRule } from '../../domain/policy/payment-retention.policy';

/**
 * WEMP-M09-PLAN-001 M09-M2 (decision D-11). The retention configuration
 * port for Module 09. Returns the record-retention rules keyed by record
 * category. The configuration source is centrally configurable per
 * environment; fail closed when unconfigured.
 */
export interface PaymentRetentionConfigurationPort {
  /** Resolves the retention rule for a category, or undefined when unconfigured. */
  resolveRule(category: string): PaymentRetentionRule | undefined;
}
