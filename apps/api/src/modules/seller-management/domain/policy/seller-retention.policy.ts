import { SellerDomainError } from '../errors/seller-domain.error';

/**
 * WEMP-M03-SPEC-001 / decision D-03 (owner-approved 2026-08-12). Evidence
 * retention rules are centrally configurable per evidence/document category —
 * never hard-coded into business logic. The retention window for a category is
 * a positive number of days from evidence upload. Missing or invalid retention
 * configuration fails closed: the processor must not delete anything when the
 * rule for a category cannot be resolved. Jurisdiction-specific final durations
 * remain configurable and subject to Legal/Compliance review; this policy
 * makes no regulatory compliance claim.
 */
export interface SellerEvidenceRetentionRule {
  /** Evidence/document category (e.g. GST_CERTIFICATE, PAN_CARD). */
  readonly category: string;
  /** Retention window in whole days; must be a positive safe integer. */
  readonly retentionDays: number;
}

export type RetentionEvaluation =
  | { readonly outcome: 'WITHIN_RETENTION'; readonly expiresAt: Date }
  | { readonly outcome: 'RETENTION_EXPIRED'; readonly expiredAt: Date }
  | { readonly outcome: 'HELD'; readonly legalHoldActive: boolean };

export class SellerRetentionPolicy {
  /**
   * Resolves the expiry instant for evidence of a category uploaded at
   * uploadedAt under the given rule. Fail closed: an absent or invalid rule
   * throws SellerDomainError so the processor aborts rather than delete.
   */
  public evaluateRule(rule: SellerEvidenceRetentionRule | undefined): {
    readonly category: string;
    readonly retentionDays: number;
  } {
    if (rule === undefined) {
      throw new SellerDomainError('SELLER_RETENTION_CONFIG_MISSING');
    }
    if (!Number.isSafeInteger(rule.retentionDays) || rule.retentionDays < 1) {
      throw new SellerDomainError('SELLER_RETENTION_CONFIG_INVALID');
    }
    return { category: rule.category, retentionDays: rule.retentionDays };
  }

  /**
   * Decides what the retention processor must do with an evidence record.
   * A legal hold always wins (HELD, never delete). Otherwise the evidence is
   * WITHIN_RETENTION until retentionDays after upload, then
   * RETENTION_EXPIRED. Rule resolution fails closed (throws).
   */
  public evaluate(
    uploadedAt: Date,
    now: Date,
    rule: SellerEvidenceRetentionRule | undefined,
    legalHoldActive: boolean,
  ): RetentionEvaluation {
    if (legalHoldActive) {
      return { outcome: 'HELD', legalHoldActive: true };
    }
    const resolved = this.evaluateRule(rule);
    const expiresAt = new Date(uploadedAt.getTime() + resolved.retentionDays * 86_400_000);
    if (now >= expiresAt) {
      return { outcome: 'RETENTION_EXPIRED', expiredAt: expiresAt };
    }
    return { outcome: 'WITHIN_RETENTION', expiresAt };
  }
}
