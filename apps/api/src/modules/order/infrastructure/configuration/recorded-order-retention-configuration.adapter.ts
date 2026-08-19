import type { OrderRetentionConfigurationPort } from '../../application/ports/order-retention-configuration.port';
import type { OrderRetentionRule } from '../../domain/policy/order-retention.policy';

/**
 * WEMP-M08-PLAN-001 M08-M2. The D-07 retention configuration for Module 08,
 * sourced from a single, centrally-configurable environment variable
 * (ORDER_RECORD_RETENTION_DAYS). Default: owner-resolved per M07 D-11
 * precedent. The value is read at construction time and never changes for
 * the lifetime of the application process.
 *
 * The OrderRetentionPolicy (M08-M1) evaluates each rule; fail closed when
 * unconfigured — the processor must not delete anything when the rule for
 * a category cannot be resolved (D-07).
 */
export class RecordedOrderRetentionConfigurationAdapter implements OrderRetentionConfigurationPort {
  private readonly retentionDays: number;

  public constructor() {
    const raw = process.env.ORDER_RECORD_RETENTION_DAYS;
    this.retentionDays = raw !== undefined ? Number(raw) : 365;
  }

  public resolveRule(category: string): OrderRetentionRule | undefined {
    // All order record categories share the same configurable retention window.
    return { category, retentionDays: this.retentionDays };
  }
}
