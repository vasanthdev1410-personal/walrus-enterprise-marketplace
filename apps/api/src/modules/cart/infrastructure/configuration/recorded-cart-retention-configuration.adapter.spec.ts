import { RecordedCartRetentionConfigurationAdapter } from './recorded-cart-retention-configuration.adapter';

describe('RecordedCartRetentionConfigurationAdapter (M07-M2, D-11)', () => {
  const previous = process.env.CART_RECORD_RETENTION_DAYS;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.CART_RECORD_RETENTION_DAYS;
    } else {
      process.env.CART_RECORD_RETENTION_DAYS = previous;
    }
  });

  it('returns 90-day default for all categories', () => {
    delete process.env.CART_RECORD_RETENTION_DAYS;
    const adapter = new RecordedCartRetentionConfigurationAdapter();
    const rule = adapter.resolveRule('CartAuditRecord');
    expect(rule).toEqual({ category: 'CartAuditRecord', retentionDays: 90 });
  });

  it('returns 90-day default for CartStateTransition', () => {
    delete process.env.CART_RECORD_RETENTION_DAYS;
    const adapter = new RecordedCartRetentionConfigurationAdapter();
    const rule = adapter.resolveRule('CartStateTransition');
    expect(rule).toEqual({ category: 'CartStateTransition', retentionDays: 90 });
  });

  it('uses env-var override when set', () => {
    process.env.CART_RECORD_RETENTION_DAYS = '180';
    const adapter = new RecordedCartRetentionConfigurationAdapter();
    const rule = adapter.resolveRule('CartAuditRecord');
    expect(rule?.retentionDays).toBe(180);
  });

  it('returns a rule for any category name', () => {
    delete process.env.CART_RECORD_RETENTION_DAYS;
    const adapter = new RecordedCartRetentionConfigurationAdapter();
    const rule = adapter.resolveRule('any-category');
    expect(rule).toEqual({ category: 'any-category', retentionDays: 90 });
  });
});
