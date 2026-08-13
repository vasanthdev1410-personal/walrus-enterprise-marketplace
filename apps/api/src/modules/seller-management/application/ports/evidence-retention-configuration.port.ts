import type { SellerEvidenceRetentionRule } from '../../domain/policy/seller-retention.policy';

/**
 * WEMP-M03-SPEC-001 / decision D-03. Centrally configurable evidence/document
 * retention rules keyed by category. The configuration source (environment,
 * config file) is the single point of control; business logic never hard-codes
 * retention durations. A category with no resolvable rule fails closed — the
 * retention processor must not delete evidence it cannot classify.
 */
export interface EvidenceRetentionConfigurationPort {
  /** Resolves the retention rule for a category, or undefined when unconfigured. */
  findRule(category: string): Promise<SellerEvidenceRetentionRule | undefined>;
}
