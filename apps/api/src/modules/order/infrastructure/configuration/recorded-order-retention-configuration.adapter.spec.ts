import { RecordedOrderRetentionConfigurationAdapter } from './recorded-order-retention-configuration.adapter';

describe('RecordedOrderRetentionConfigurationAdapter', () => {
  const originalEnv = process.env.ORDER_RECORD_RETENTION_DAYS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ORDER_RECORD_RETENTION_DAYS = originalEnv;
    } else {
      delete process.env.ORDER_RECORD_RETENTION_DAYS;
    }
  });

  it('uses default 365 days when env is unset', () => {
    delete process.env.ORDER_RECORD_RETENTION_DAYS;
    const adapter = new RecordedOrderRetentionConfigurationAdapter();
    expect(adapter.resolveRule('ORDER')).toEqual({
      category: 'ORDER',
      retentionDays: 365,
    });
  });

  it('uses configured retention days from env', () => {
    process.env.ORDER_RECORD_RETENTION_DAYS = '90';
    const adapter = new RecordedOrderRetentionConfigurationAdapter();
    expect(adapter.resolveRule('ORDER')).toEqual({
      category: 'ORDER',
      retentionDays: 90,
    });
  });

  it('returns a rule for any category', () => {
    const adapter = new RecordedOrderRetentionConfigurationAdapter();
    const rule = adapter.resolveRule('INVOICE');
    expect(rule).toBeDefined();
    expect(rule?.category).toBe('INVOICE');
  });
});
