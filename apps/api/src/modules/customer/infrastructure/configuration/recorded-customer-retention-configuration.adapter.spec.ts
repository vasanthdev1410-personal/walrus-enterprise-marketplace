import { CustomerRetentionPolicy } from '../../domain/policy/customer-retention.policy';
import { RecordedCustomerRetentionConfigurationAdapter } from './recorded-customer-retention-configuration.adapter';

const NOW = new Date('2026-08-17T00:00:00.000Z');

describe('RecordedCustomerRetentionConfigurationAdapter (M06-M2, D-15)', () => {
  it('resolves the recorded 2555-day retention for the audit/history categories', async () => {
    const adapter = new RecordedCustomerRetentionConfigurationAdapter();
    const transitionRule = await adapter.findRule('CustomerStateTransition');
    const auditRule = await adapter.findRule('CustomerAuditRecord');
    expect(transitionRule?.retentionDays).toBe(2555);
    expect(auditRule?.retentionDays).toBe(2555);
  });

  it('resolves no rule for categories outside the D-15 scope (fail closed)', async () => {
    const adapter = new RecordedCustomerRetentionConfigurationAdapter();
    for (const category of [
      'CustomerProfile',
      'CustomerAddress',
      'CustomerBusinessProfile',
      'CustomerPreference',
      'Credential',
      'Session',
      'Identity',
    ]) {
      expect(await adapter.findRule(category)).toBeUndefined();
    }
  });

  it('honors the environment override while defaulting to 2555', async () => {
    const previous = process.env.CUSTOMER_RECORD_RETENTION_DAYS;
    process.env.CUSTOMER_RECORD_RETENTION_DAYS = '3000';
    try {
      const adapter = new RecordedCustomerRetentionConfigurationAdapter();
      expect((await adapter.findRule('CustomerAuditRecord'))?.retentionDays).toBe(3000);
    } finally {
      if (previous === undefined) delete process.env.CUSTOMER_RECORD_RETENTION_DAYS;
      else process.env.CUSTOMER_RECORD_RETENTION_DAYS = previous;
    }
  });

  describe('CustomerRetentionPolicy (D-15, fail closed)', () => {
    it('rejects a missing rule so the processor never deletes unclassified records', () => {
      const policy = new CustomerRetentionPolicy();
      expect(() => policy.evaluateRule(undefined)).toThrow('CUSTOMER_RETENTION_CONFIG_MISSING');
      expect(() => policy.evaluateRule({ category: 'X', retentionDays: 0 })).toThrow(
        'CUSTOMER_RETENTION_CONFIG_INVALID',
      );
    });

    it('evaluates within/expired retention windows from the configured rule', () => {
      const policy = new CustomerRetentionPolicy();
      const createdAt = new Date('2026-08-10T00:00:00.000Z');
      const within = policy.evaluate(
        createdAt,
        NOW,
        { category: 'CustomerAuditRecord', retentionDays: 2555 },
        false,
      );
      expect(within.outcome).toBe('WITHIN_RETENTION');
      const expired = policy.evaluate(
        new Date('2019-08-10T00:00:00.000Z'),
        NOW,
        { category: 'CustomerAuditRecord', retentionDays: 2555 },
        false,
      );
      expect(expired.outcome).toBe('RETENTION_EXPIRED');
    });

    it('a legal hold always wins over retention expiry', () => {
      const policy = new CustomerRetentionPolicy();
      const result = policy.evaluate(
        new Date('2019-08-10T00:00:00.000Z'),
        NOW,
        { category: 'CustomerAuditRecord', retentionDays: 2555 },
        true,
      );
      expect(result).toEqual({ outcome: 'HELD', legalHoldActive: true });
    });
  });
});
