import { CartDomainError } from '../errors/cart-domain.error';

/**
 * WEMP-M07-SPEC-001 (decision D-11). Cart record retention rules are
 * centrally configurable per record category — never hard-coded into
 * business logic. The retention window for a category is a positive
 * number of days from record creation. Missing or invalid retention
 * configuration fails closed: the processor must not delete anything
 * when the rule for a category cannot be resolved.
 *
 * Recorded value (owner-approved 2026-08-18): CartAuditRecord 90 days;
 * CartStateTransition 90 days. These apply ONLY to the M07 records the
 * approved architecture explicitly requires to be retained for
 * audit/business history — never to authentication data or unrelated
 * Module 01 identity/security data (A-03).
 */
export interface CartRetentionRule {
  readonly category: string;
  readonly retentionDays: number;
}

export type CartRetentionEvaluation =
  | { readonly outcome: 'WITHIN_RETENTION'; readonly expiresAt: Date }
  | { readonly outcome: 'RETENTION_EXPIRED'; readonly expiredAt: Date }
  | { readonly outcome: 'HELD'; readonly legalHoldActive: boolean };

export class CartRetentionPolicy {
  public evaluateRule(rule: CartRetentionRule | undefined): {
    readonly category: string;
    readonly retentionDays: number;
  } {
    if (rule === undefined) {
      throw new CartDomainError('CART_RETENTION_CONFIG_MISSING');
    }
    if (!Number.isSafeInteger(rule.retentionDays) || rule.retentionDays < 1) {
      throw new CartDomainError('CART_RETENTION_CONFIG_INVALID');
    }
    return { category: rule.category, retentionDays: rule.retentionDays };
  }

  public evaluate(
    createdAt: Date,
    now: Date,
    rule: CartRetentionRule | undefined,
    legalHoldActive: boolean,
  ): CartRetentionEvaluation {
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
