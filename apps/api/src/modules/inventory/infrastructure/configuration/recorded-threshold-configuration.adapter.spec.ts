import { RecordedThresholdConfigurationAdapter } from './recorded-threshold-configuration.adapter';

describe('RecordedThresholdConfigurationAdapter (M05-M3, D-14 — Gate #4 RECORDED 2026-08-15)', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
  });

  it('resolves the recorded values (LOW_STOCK_THRESHOLD=1, OUT_OF_STOCK_THRESHOLD=0)', async () => {
    delete process.env.LOW_STOCK_THRESHOLD;
    delete process.env.OUT_OF_STOCK_THRESHOLD;
    const adapter = new RecordedThresholdConfigurationAdapter();
    const config = await adapter.findThresholdConfig();
    expect(config?.properties.lowStockThreshold).toBe(1);
    expect(config?.properties.outOfStockThreshold).toBe(0);
  });

  it('honors environment configuration overrides (single configuration point)', async () => {
    process.env.LOW_STOCK_THRESHOLD = '3';
    process.env.OUT_OF_STOCK_THRESHOLD = '2';
    const adapter = new RecordedThresholdConfigurationAdapter();
    const config = await adapter.findThresholdConfig();
    expect(config?.properties.lowStockThreshold).toBe(3);
    expect(config?.properties.outOfStockThreshold).toBe(2);
  });

  it('fails closed on an invalid configuration (no label enforcement)', async () => {
    process.env.LOW_STOCK_THRESHOLD = '2';
    process.env.OUT_OF_STOCK_THRESHOLD = '5';
    const adapter = new RecordedThresholdConfigurationAdapter();
    expect(await adapter.findThresholdConfig()).toBeUndefined();
  });

  it('fails closed on unparseable configuration', async () => {
    process.env.LOW_STOCK_THRESHOLD = 'abc';
    process.env.OUT_OF_STOCK_THRESHOLD = '0';
    const adapter = new RecordedThresholdConfigurationAdapter();
    expect(await adapter.findThresholdConfig()).toBeUndefined();
  });
});
