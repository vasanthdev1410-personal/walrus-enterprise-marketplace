import type { CartRetentionConfigurationPort } from '../../application/ports/cart-retention-configuration.port';
import type { CartRetentionRule } from '../../domain/policy/cart-retention.policy';

/**
 * WEMP-M07-PLAN-001 M07-M2. The D-11 retention configuration for Module 07,
 * sourced from a single, centrally-configurable environment variable
 * (CART_RECORD_RETENTION_DAYS). Owner-approved default: 90 days for all
 * cart audit/history record categories. The value is read at construction
 * time and never changes for the lifetime of the application process.
 *
 * The CartRetentionPolicy (M07-M1) evaluates each rule; fail closed when
 * unconfigured — the processor must not delete anything when the rule for
 * a category cannot be resolved (D-11).
 */
export class RecordedCartRetentionConfigurationAdapter implements CartRetentionConfigurationPort {
  private readonly retentionDays: number;

  public constructor() {
    const raw = process.env.CART_RECORD_RETENTION_DAYS;
    this.retentionDays = raw !== undefined ? Number(raw) : 90;
  }

  public resolveRule(category: string): CartRetentionRule | undefined {
    // All cart record categories share the same configurable retention window.
    return { category, retentionDays: this.retentionDays };
  }
}
