import { InventoryDomainError } from '../errors/inventory-domain.error';

/**
 * WEMP-M05-SPEC-001 §21 / decision D-12 (owner-approved 2026-08-14;
 * durations RECORDED 2026-08-15). Evidence retention rules are centrally
 * configurable per record category — never hard-coded into business
 * logic. The retention window for a category is a positive number of days
 * from record creation. Missing or invalid retention configuration fails
 * closed: the processor must not delete anything when the rule for a
 * category cannot be resolved. Jurisdiction-specific durations were
 * recorded 2026-08-15 (InventoryMovementRecord 2555 days;
 * InventoryAuditRecord 2555 days); this policy makes no regulatory
 * compliance claim.
 */
export interface InventoryRetentionRule {
  /** Evidence/record category (e.g. InventoryMovementRecord, InventoryAuditRecord). */
  readonly category: string;
  /** Retention window in whole days; must be a positive safe integer. */
  readonly retentionDays: number;
}

export type InventoryRetentionEvaluation =
  | { readonly outcome: 'WITHIN_RETENTION'; readonly expiresAt: Date }
  | { readonly outcome: 'RETENTION_EXPIRED'; readonly expiredAt: Date }
  | { readonly outcome: 'HELD'; readonly legalHoldActive: boolean };

export class InventoryRetentionPolicy {
  /**
   * Resolves the retention rule for a category. Fail closed: an absent or
   * invalid rule throws InventoryDomainError so the processor aborts
   * rather than delete (D-12).
   */
  public evaluateRule(rule: InventoryRetentionRule | undefined): {
    readonly category: string;
    readonly retentionDays: number;
  } {
    if (rule === undefined) {
      throw new InventoryDomainError('INVENTORY_RETENTION_CONFIG_MISSING');
    }
    if (!Number.isSafeInteger(rule.retentionDays) || rule.retentionDays < 1) {
      throw new InventoryDomainError('INVENTORY_RETENTION_CONFIG_INVALID');
    }
    return { category: rule.category, retentionDays: rule.retentionDays };
  }

  /**
   * Decides what the retention processor must do with an evidence record.
   * A legal hold always wins (HELD, never delete). Otherwise the record is
   * WITHIN_RETENTION until retentionDays after its createdAt, then
   * RETENTION_EXPIRED. Rule resolution fails closed (throws) — no
   * deletion without a valid configured duration (D-12).
   */
  public evaluate(
    createdAt: Date,
    now: Date,
    rule: InventoryRetentionRule | undefined,
    legalHoldActive: boolean,
  ): InventoryRetentionEvaluation {
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
