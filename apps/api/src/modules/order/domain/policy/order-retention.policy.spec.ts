import { OrderDomainError } from '../errors/order-domain.error';
import { OrderRetentionPolicy } from './order-retention.policy';

describe('OrderRetentionPolicy', () => {
  const policy = new OrderRetentionPolicy();

  describe('evaluateRule', () => {
    it('returns the rule when valid', () => {
      const result = policy.evaluateRule({ category: 'audit', retentionDays: 365 });
      expect(result.category).toBe('audit');
      expect(result.retentionDays).toBe(365);
    });

    it('throws when rule is undefined', () => {
      expect(() => policy.evaluateRule(undefined)).toThrow(OrderDomainError);
    });

    it('throws when retentionDays is zero', () => {
      expect(() => policy.evaluateRule({ category: 'audit', retentionDays: 0 })).toThrow(
        OrderDomainError,
      );
    });

    it('throws when retentionDays is negative', () => {
      expect(() => policy.evaluateRule({ category: 'audit', retentionDays: -1 })).toThrow(
        OrderDomainError,
      );
    });

    it('throws when retentionDays is not an integer', () => {
      expect(() => policy.evaluateRule({ category: 'audit', retentionDays: 1.5 })).toThrow(
        OrderDomainError,
      );
    });
  });

  describe('evaluate', () => {
    it('returns WITHIN_RETENTION when not expired', () => {
      const now = new Date('2026-08-19T12:00:00.000Z');
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      const rule = { category: 'audit', retentionDays: 90 };
      const result = policy.evaluate(createdAt, now, rule, false);
      expect(result.outcome).toBe('WITHIN_RETENTION');
    });

    it('returns RETENTION_EXPIRED when expired', () => {
      const now = new Date('2026-12-01T00:00:00.000Z');
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      const rule = { category: 'audit', retentionDays: 90 };
      const result = policy.evaluate(createdAt, now, rule, false);
      expect(result.outcome).toBe('RETENTION_EXPIRED');
    });

    it('returns HELD when legal hold is active', () => {
      const now = new Date('2026-08-19T12:00:00.000Z');
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      const rule = { category: 'audit', retentionDays: 90 };
      const result = policy.evaluate(createdAt, now, rule, true);
      expect(result.outcome).toBe('HELD');
    });

    it('returns HELD even when retention would be expired', () => {
      const now = new Date('2026-12-01T00:00:00.000Z');
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      const rule = { category: 'audit', retentionDays: 90 };
      const result = policy.evaluate(createdAt, now, rule, true);
      expect(result.outcome).toBe('HELD');
    });

    it('throws when rule is undefined', () => {
      const now = new Date('2026-08-19T12:00:00.000Z');
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      expect(() => policy.evaluate(createdAt, now, undefined, false)).toThrow(OrderDomainError);
    });
  });
});
