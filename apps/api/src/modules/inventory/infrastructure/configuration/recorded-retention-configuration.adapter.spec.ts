import { RecordedRetentionConfigurationAdapter } from './recorded-retention-configuration.adapter';

describe('RecordedRetentionConfigurationAdapter (D-12, recorded 2026-08-15)', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
  });

  it('resolves the recorded 2555-day rules for both record categories', async () => {
    delete process.env.INVENTORY_MOVEMENT_RETENTION_DAYS;
    delete process.env.INVENTORY_AUDIT_RETENTION_DAYS;
    const adapter = new RecordedRetentionConfigurationAdapter();

    await expect(adapter.findRule('InventoryMovementRecord')).resolves.toEqual({
      category: 'InventoryMovementRecord',
      retentionDays: 2555,
    });
    await expect(adapter.findRule('InventoryAuditRecord')).resolves.toEqual({
      category: 'InventoryAuditRecord',
      retentionDays: 2555,
    });
  });

  it('returns undefined for an unknown category (fail closed)', async () => {
    const adapter = new RecordedRetentionConfigurationAdapter();
    await expect(adapter.findRule('UnknownCategory')).resolves.toBeUndefined();
  });

  it('respects environment overrides for the configuration source', async () => {
    process.env.INVENTORY_MOVEMENT_RETENTION_DAYS = '100';
    const adapter = new RecordedRetentionConfigurationAdapter();
    await expect(adapter.findRule('InventoryMovementRecord')).resolves.toEqual({
      category: 'InventoryMovementRecord',
      retentionDays: 100,
    });
  });
});
