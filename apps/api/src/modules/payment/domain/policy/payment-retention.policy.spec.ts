import { PaymentRetentionPolicy } from './payment-retention.policy';

/**
 * WEMP-M09-PLAN-001 M09-M2. Tests for the PaymentRetentionPolicy — the
 * domain-level retention evaluator. Mirrors the M08 OrderRetentionPolicy
 * test pattern.
 */
describe('PaymentRetentionPolicy', () => {
  const policy = new PaymentRetentionPolicy();

  describe('evaluateRule', () => {
    it('returns the rule when provided', () => {
      const result = policy.evaluateRule({ category: 'audit', retentionDays: 365 });
      expect(result).toEqual({ category: 'audit', retentionDays: 365 });
    });

    it('throws PAYMENT_RETENTION_CONFIG_MISSING when rule is undefined', () => {
      expect(() => policy.evaluateRule(undefined)).toThrow('PAYMENT_RETENTION_CONFIG_MISSING');
    });

    it('throws PAYMENT_RETENTION_CONFIG_INVALID when retentionDays is zero', () => {
      expect(() => policy.evaluateRule({ category: 'audit', retentionDays: 0 })).toThrow(
        'PAYMENT_RETENTION_CONFIG_INVALID',
      );
    });

    it('throws PAYMENT_RETENTION_CONFIG_INVALID when retentionDays is negative', () => {
      expect(() => policy.evaluateRule({ category: 'audit', retentionDays: -1 })).toThrow(
        'PAYMENT_RETENTION_CONFIG_INVALID',
      );
    });

    it('throws PAYMENT_RETENTION_CONFIG_INVALID when retentionDays is not an integer', () => {
      expect(() => policy.evaluateRule({ category: 'audit', retentionDays: 1.5 })).toThrow(
        'PAYMENT_RETENTION_CONFIG_INVALID',
      );
    });
  });

  describe('evaluate', () => {
    it('returns WITHIN_RETENTION when within the window', () => {
      const now = new Date('2026-08-20T12:00:00Z');
      const createdAt = new Date('2026-08-01T12:00:00Z');
      const rule = { category: 'audit', retentionDays: 365 };

      const result = policy.evaluate(createdAt, now, rule, false);
      expect(result.outcome).toBe('WITHIN_RETENTION');
      if (result.outcome === 'WITHIN_RETENTION') {
        expect(result.expiresAt.getTime()).toBeGreaterThan(now.getTime());
      }
    });

    it('returns RETENTION_EXPIRED when past the window', () => {
      const now = new Date('2028-01-01T12:00:00Z');
      const createdAt = new Date('2026-08-01T12:00:00Z');
      const rule = { category: 'audit', retentionDays: 365 };

      const result = policy.evaluate(createdAt, now, rule, false);
      expect(result.outcome).toBe('RETENTION_EXPIRED');
      if (result.outcome === 'RETENTION_EXPIRED') {
        expect(result.expiredAt.getTime()).toBeLessThan(now.getTime());
      }
    });

    it('returns HELD when legal hold is active regardless of age', () => {
      const now = new Date('2030-01-01T12:00:00Z');
      const createdAt = new Date('2026-08-01T12:00:00Z');
      const rule = { category: 'audit', retentionDays: 365 };

      const result = policy.evaluate(createdAt, now, rule, true);
      expect(result.outcome).toBe('HELD');
      if (result.outcome === 'HELD') {
        expect(result.legalHoldActive).toBe(true);
      }
    });

    it('returns WITHIN_RETENTION on the day before expiry', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const now = new Date('2026-12-31T00:00:00Z');
      const rule = { category: 'audit', retentionDays: 365 };

      const result = policy.evaluate(createdAt, now, rule, false);
      expect(result.outcome).toBe('WITHIN_RETENTION');
    });

    it('returns RETENTION_EXPIRED on the exact expiry day', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const expiresAt = new Date(createdAt.getTime() + 365 * 86_400_000);
      const now = expiresAt;
      const rule = { category: 'audit', retentionDays: 365 };

      const result = policy.evaluate(createdAt, now, rule, false);
      expect(result.outcome).toBe('RETENTION_EXPIRED');
    });

    it('throws when rule is undefined and not on legal hold', () => {
      const now = new Date('2026-08-20T12:00:00Z');
      const createdAt = new Date('2026-08-01T12:00:00Z');

      expect(() => policy.evaluate(createdAt, now, undefined, false)).toThrow(
        'PAYMENT_RETENTION_CONFIG_MISSING',
      );
    });
  });
});
