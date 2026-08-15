import { InventoryDomainError } from '../errors/inventory-domain.error';
import { InventoryRetentionPolicy } from './inventory-retention.policy';

const NOW = new Date('2026-08-15T00:00:00.000Z');
const CREATED = new Date('2026-08-14T00:00:00.000Z');

describe('InventoryRetentionPolicy (M05-M2, WEMP-M05-SPEC-001 §21, D-12)', () => {
  const policy = new InventoryRetentionPolicy();

  it('accepts the recorded D-12 durations (2555 days, owner-approved 2026-08-15)', () => {
    const movement = policy.evaluateRule({
      category: 'InventoryMovementRecord',
      retentionDays: 2555,
    });
    expect(movement.retentionDays).toBe(2555);

    const audit = policy.evaluateRule({
      category: 'InventoryAuditRecord',
      retentionDays: 2555,
    });
    expect(audit.retentionDays).toBe(2555);
  });

  it('fails closed when the rule for a category is missing (no deletion)', () => {
    expect(() => policy.evaluateRule(undefined)).toThrow(
      new InventoryDomainError('INVENTORY_RETENTION_CONFIG_MISSING'),
    );
  });

  it('fails closed on an invalid retention duration', () => {
    expect(() =>
      policy.evaluateRule({ category: 'InventoryMovementRecord', retentionDays: 0 }),
    ).toThrow(new InventoryDomainError('INVENTORY_RETENTION_CONFIG_INVALID'));
    expect(() =>
      policy.evaluateRule({ category: 'InventoryMovementRecord', retentionDays: -1 }),
    ).toThrow(new InventoryDomainError('INVENTORY_RETENTION_CONFIG_INVALID'));
  });

  it('keeps records WITHIN_RETENTION until retentionDays after creation', () => {
    const evaluation = policy.evaluate(
      CREATED,
      NOW,
      { category: 'InventoryMovementRecord', retentionDays: 2555 },
      false,
    );
    expect(evaluation).toEqual({
      outcome: 'WITHIN_RETENTION',
      expiresAt: new Date(CREATED.getTime() + 2555 * 86_400_000),
    });
  });

  it('marks records RETENTION_EXPIRED after the window', () => {
    // 2555 days ≈ 7 years; a 2018 record is beyond the window by 2026.
    const longAgo = new Date('2018-01-01T00:00:00.000Z');
    const evaluation = policy.evaluate(
      longAgo,
      NOW,
      { category: 'InventoryAuditRecord', retentionDays: 2555 },
      false,
    );
    expect(evaluation.outcome).toBe('RETENTION_EXPIRED');
    expect((evaluation as { expiredAt: Date }).expiredAt.getTime()).toBe(
      longAgo.getTime() + 2555 * 86_400_000,
    );
  });

  it('a legal hold always wins and never deletes', () => {
    const longAgo = new Date('2018-01-01T00:00:00.000Z');
    const evaluation = policy.evaluate(
      longAgo,
      NOW,
      { category: 'InventoryAuditRecord', retentionDays: 2555 },
      true,
    );
    expect(evaluation).toEqual({ outcome: 'HELD', legalHoldActive: true });
  });

  it('a legal hold wins even without a resolvable rule (fail closed to hold, not delete)', () => {
    const evaluation = policy.evaluate(CREATED, NOW, undefined, true);
    expect(evaluation).toEqual({ outcome: 'HELD', legalHoldActive: true });
  });
});
