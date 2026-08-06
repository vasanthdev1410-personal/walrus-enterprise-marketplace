import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('exposes Prometheus content and process metrics', async () => {
    const metrics = new MetricsService();
    expect(metrics.contentType).toContain('text/plain');
    await expect(metrics.metrics()).resolves.toContain('walrus_api_process_');
  });
});
