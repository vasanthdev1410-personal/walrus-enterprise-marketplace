import { CartRetentionPolicy } from './cart-retention.policy';
import { CartDomainError } from '../errors/cart-domain.error';

const policy = new CartRetentionPolicy();

describe('CartRetentionPolicy.evaluateRule', () => {
  it('should resolve a valid rule', () => {
    const result = policy.evaluateRule({ category: 'CartAuditRecord', retentionDays: 90 });
    expect(result.category).toBe('CartAuditRecord');
    expect(result.retentionDays).toBe(90);
  });

  it('should throw on undefined rule', () => {
    expect(() => policy.evaluateRule(undefined)).toThrow(CartDomainError);
  });

  it('should throw on zero retention days', () => {
    expect(() => policy.evaluateRule({ category: 'CartAuditRecord', retentionDays: 0 })).toThrow(
      CartDomainError,
    );
  });

  it('should throw on negative retention days', () => {
    expect(() => policy.evaluateRule({ category: 'CartAuditRecord', retentionDays: -1 })).toThrow(
      CartDomainError,
    );
  });
});

describe('CartRetentionPolicy.evaluate', () => {
  const createdAt = new Date('2026-08-18T00:00:00Z');
  const rule = { category: 'CartAuditRecord', retentionDays: 90 };

  it('should return WITHIN_RETENTION when within window', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    const result = policy.evaluate(createdAt, now, rule, false);
    expect(result.outcome).toBe('WITHIN_RETENTION');
    if (result.outcome === 'WITHIN_RETENTION') {
      expect(result.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it('should return RETENTION_EXPIRED when past window', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    const result = policy.evaluate(createdAt, now, rule, false);
    expect(result.outcome).toBe('RETENTION_EXPIRED');
  });

  it('should return HELD when legal hold active', () => {
    const now = new Date('2099-01-01T00:00:00Z');
    const result = policy.evaluate(createdAt, now, rule, true);
    expect(result.outcome).toBe('HELD');
    if (result.outcome === 'HELD') {
      expect(result.legalHoldActive).toBe(true);
    }
  });

  it('should throw on missing rule', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    expect(() => policy.evaluate(createdAt, now, undefined, false)).toThrow(CartDomainError);
  });
});
