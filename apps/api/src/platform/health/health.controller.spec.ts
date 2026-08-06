import { HealthController } from './health.controller';
import type { HealthService } from './health.service';
import type { MetricsService } from '../metrics/metrics.service';

const live = { status: 'UP', service: 'api', version: '1.0.0', timestamp: 'now' } as const;

describe('HealthController', () => {
  it('serves basic and liveness status', () => {
    const health = { liveness: jest.fn(() => live) } as unknown as HealthService;
    const controller = new HealthController(health, {} as MetricsService);
    expect(controller.healthStatus()).toBe(live);
    expect(controller.liveness()).toBe(live);
  });

  it.each([
    ['UP', 200],
    ['DOWN', 503],
  ] as const)('maps readiness %s to HTTP %s', async (serviceStatus, httpStatus) => {
    const result = {
      ...live,
      status: serviceStatus,
      dependencies: { postgres: serviceStatus, redis: serviceStatus },
    };
    const health = {
      readiness: jest.fn(() => Promise.resolve(result)),
    } as unknown as HealthService;
    const response = { status: jest.fn(() => ({ json: jest.fn() })) };
    await new HealthController(health, {} as MetricsService).readiness(response as never);
    expect(response.status).toHaveBeenCalledWith(httpStatus);
  });

  it('returns Prometheus metrics using its registered content type', async () => {
    const metrics = {
      contentType: 'text/plain',
      metrics: jest.fn(() => Promise.resolve('metric 1')),
    } as unknown as MetricsService;
    const send = jest.fn();
    const response = { type: jest.fn(() => ({ send })) };
    await new HealthController({} as HealthService, metrics).prometheus(response as never);
    expect(response.type).toHaveBeenCalledWith('text/plain');
    expect(send).toHaveBeenCalledWith('metric 1');
  });
});
