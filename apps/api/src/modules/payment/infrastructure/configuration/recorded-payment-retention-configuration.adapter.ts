import type { PaymentRetentionConfigurationPort } from '../../application/ports/payment-retention-configuration.port';
import type { PaymentRetentionRule } from '../../domain/policy/payment-retention.policy';

/**
 * WEMP-M09-PLAN-001 M09-M2. The D-11 retention configuration for Module 09,
 * sourced from a single, centrally-configurable environment variable
 * (PAYMENT_RECORD_RETENTION_DAYS). Default: 365 days (owner-resolved per
 * M07/M08 D-11 precedent). The value is read at construction time and never
 * changes for the lifetime of the application process.
 *
 * The PaymentRetentionPolicy (M09-M1) evaluates each rule; fail closed when
 * unconfigured — the processor must not delete anything when the rule for a
 * category cannot be resolved.
 */
export class RecordedPaymentRetentionConfigurationAdapter implements PaymentRetentionConfigurationPort {
  private readonly retentionDays: number;

  public constructor() {
    const raw = process.env.PAYMENT_RECORD_RETENTION_DAYS;
    this.retentionDays = raw !== undefined ? Number(raw) : 365;
  }

  public resolveRule(category: string): PaymentRetentionRule | undefined {
    return { category, retentionDays: this.retentionDays };
  }
}
