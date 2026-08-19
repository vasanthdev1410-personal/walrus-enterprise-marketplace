import { OrderDomainError } from '../errors/order-domain.error';

/**
 * WEMP-M08-SPEC-001 (decision D-07). Order record retention rules are
 * centrally configurable per record category — never hard-coded into
 * business logic. The retention window for a category is a positive
 * number of days from record creation. Missing or invalid retention
 * configuration fails closed: the processor must not delete anything
 * when the rule for a category cannot be resolved.
 *
 * Recorded value (owner-resolved per M07 D-11 precedent): OrderAuditRecord
 * and OrderStateTransition retention configurable via
 * ORDER_RECORD_RETENTION_DAYS. Legal/Compliance review deferred to
 * deployment-time configuration.
 */
export interface OrderRetentionRule {
  readonly category: string;
  readonly retentionDays: number;
}

export type OrderRetentionEvaluation =
  | { readonly outcome: 'WITHIN_RETENTION'; readonly expiresAt: Date }
  | { readonly outcome: 'RETENTION_EXPIRED'; readonly expiredAt: Date }
  | { readonly outcome: 'HELD'; readonly legalHoldActive: boolean };

export class OrderRetentionPolicy {
  public evaluateRule(rule: OrderRetentionRule | undefined): {
    readonly category: string;
    readonly retentionDays: number;
  } {
    if (rule === undefined) {
      throw new OrderDomainError('ORDER_RETENTION_CONFIG_MISSING');
    }
    if (!Number.isSafeInteger(rule.retentionDays) || rule.retentionDays < 1) {
      throw new OrderDomainError('ORDER_RETENTION_CONFIG_INVALID');
    }
    return { category: rule.category, retentionDays: rule.retentionDays };
  }

  public evaluate(
    createdAt: Date,
    now: Date,
    rule: OrderRetentionRule | undefined,
    legalHoldActive: boolean,
  ): OrderRetentionEvaluation {
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
