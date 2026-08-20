import { RecordedPaymentRetentionConfigurationAdapter } from './recorded-payment-retention-configuration.adapter';

/**
 * WEMP-M09-PLAN-001 M09-M2. Tests for the RecordedPaymentRetentionConfigurationAdapter.
 */
describe('RecordedPaymentRetentionConfigurationAdapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns default retention of 365 days when env var is not set', () => {
    delete process.env.PAYMENT_RECORD_RETENTION_DAYS;
    const adapter = new RecordedPaymentRetentionConfigurationAdapter();
    const rule = adapter.resolveRule('audit');
    expect(rule).toEqual({ category: 'audit', retentionDays: 365 });
  });

  it('returns configured retention when env var is set', () => {
    process.env.PAYMENT_RECORD_RETENTION_DAYS = '180';
    const adapter = new RecordedPaymentRetentionConfigurationAdapter();
    const rule = adapter.resolveRule('transitions');
    expect(rule).toEqual({ category: 'transitions', retentionDays: 180 });
  });

  it('always returns a rule for any category', () => {
    delete process.env.PAYMENT_RECORD_RETENTION_DAYS;
    const adapter = new RecordedPaymentRetentionConfigurationAdapter();
    expect(adapter.resolveRule('audit')).toBeDefined();
    expect(adapter.resolveRule('transitions')).toBeDefined();
    expect(adapter.resolveRule('unknown')).toBeDefined();
  });
});
