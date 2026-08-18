import { CustomerDomainError } from '../errors/customer-domain.error';

/**
 * WEMP-M06-SPEC-001 §19 / decision D-15 (owner-approved 2026-08-17).
 * Customer record retention rules are centrally configurable per record
 * category — never hard-coded into business logic. The retention window for
 * a category is a positive number of days from record creation. Missing or
 * invalid retention configuration fails closed: the processor must not
 * delete anything when the rule for a category cannot be resolved.
 *
 * Recorded values (owner-approved 2026-08-17): CustomerStateTransition 2555
 * days; CustomerAuditRecord 2555 days. These apply ONLY to the M06 records
 * the approved architecture explicitly requires to be retained for
 * audit/business/legal history — never to authentication credentials,
 * passwords, tokens, sessions, unnecessary personal data, deleted address
 * data beyond approved retention, or unrelated Module 01 identity/security
 * data (A-04). No additional retention categories are invented.
 */
export interface CustomerRetentionRule {
  /** Record category (e.g. CustomerStateTransition, CustomerAuditRecord). */
  readonly category: string;
  /** Retention window in whole days; must be a positive safe integer. */
  readonly retentionDays: number;
}

export type CustomerRetentionEvaluation =
  | { readonly outcome: 'WITHIN_RETENTION'; readonly expiresAt: Date }
  | { readonly outcome: 'RETENTION_EXPIRED'; readonly expiredAt: Date }
  | { readonly outcome: 'HELD'; readonly legalHoldActive: boolean };

export class CustomerRetentionPolicy {
  /**
   * Resolves the retention rule for a category. Fail closed: an absent or
   * invalid rule throws CustomerDomainError so the processor aborts rather
   * than delete (D-15).
   */
  public evaluateRule(rule: CustomerRetentionRule | undefined): {
    readonly category: string;
    readonly retentionDays: number;
  } {
    if (rule === undefined) {
      throw new CustomerDomainError('CUSTOMER_RETENTION_CONFIG_MISSING');
    }
    if (!Number.isSafeInteger(rule.retentionDays) || rule.retentionDays < 1) {
      throw new CustomerDomainError('CUSTOMER_RETENTION_CONFIG_INVALID');
    }
    return { category: rule.category, retentionDays: rule.retentionDays };
  }

  /**
   * Decides what the retention processor must do with a record. A legal
   * hold always wins (HELD, never delete). Otherwise the record is
   * WITHIN_RETENTION until retentionDays after its createdAt, then
   * RETENTION_EXPIRED. Rule resolution fails closed (throws) — no deletion
   * without a valid configured duration (D-15).
   */
  public evaluate(
    createdAt: Date,
    now: Date,
    rule: CustomerRetentionRule | undefined,
    legalHoldActive: boolean,
  ): CustomerRetentionEvaluation {
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
