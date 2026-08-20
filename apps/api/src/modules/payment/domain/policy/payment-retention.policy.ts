import { PaymentDomainError } from '../../domain/errors/payment-domain.error';

/**
 * WEMP-M09-PLAN-001 M09-M2 (decision D-11). Payment record retention rules
 * are centrally configurable per record category — never hard-coded into
 * business logic. The retention window for a category is a positive number
 * of days from record creation. Missing or invalid retention configuration
 * fails closed: the processor must not delete anything when the rule for a
 * category cannot be resolved.
 *
 * Recorded value: PaymentAuditRecord and PaymentStateTransition retention
 * configurable via PAYMENT_RECORD_RETENTION_DAYS. Default: 365 days
 * (owner-resolved per M07/M08 D-11 precedent).
 */
export interface PaymentRetentionRule {
  readonly category: string;
  readonly retentionDays: number;
}

export type PaymentRetentionEvaluation =
  | { readonly outcome: 'WITHIN_RETENTION'; readonly expiresAt: Date }
  | { readonly outcome: 'RETENTION_EXPIRED'; readonly expiredAt: Date }
  | { readonly outcome: 'HELD'; readonly legalHoldActive: boolean };

export class PaymentRetentionPolicy {
  public evaluateRule(rule: PaymentRetentionRule | undefined): {
    readonly category: string;
    readonly retentionDays: number;
  } {
    if (rule === undefined) {
      throw new PaymentDomainError('PAYMENT_RETENTION_CONFIG_MISSING');
    }
    if (!Number.isSafeInteger(rule.retentionDays) || rule.retentionDays < 1) {
      throw new PaymentDomainError('PAYMENT_RETENTION_CONFIG_INVALID');
    }
    return { category: rule.category, retentionDays: rule.retentionDays };
  }

  public evaluate(
    createdAt: Date,
    now: Date,
    rule: PaymentRetentionRule | undefined,
    legalHoldActive: boolean,
  ): PaymentRetentionEvaluation {
    if (legalHoldActive) {
      return { outcome: 'HELD', legalHoldActive: true };
    }
    const resolved = this.evaluateRule(rule);
    const expiresAt = new Date(createdAt.getTime() + resolved.retentionDays * 86_400_000);
    if (now >= expiresAt) {
      return { outcome: 'RETENTION_EXPIRED', expiredAt: expiresAt };
    }
    return { outcome: 'WITHIN_RETENTION', expiresAt };
  }
}
