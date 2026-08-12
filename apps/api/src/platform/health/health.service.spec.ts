import { HealthService } from './health.service';
import { ConfigurationService } from '../configuration/configuration.service';

const environment = {
  APP_NAME: 'WALRUS',
  APP_ENV: 'test',
  APP_VERSION: '1.0.0',
  API_PORT: 4000,
  INTERNAL_MTLS_ENABLED: false,
  INTERNAL_MTLS_PORT: 4443,
  INTERNAL_MTLS_CA_PATHS: '[]',
  INTERNAL_MTLS_CRL_PATHS: '[]',
  WI1_REVOKED_KEY_IDS: '[]',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: 5432,
  DATABASE_NAME: 'walrus',
  DATABASE_USER: 'walrus',
  DATABASE_PASSWORD: 'local-password',
  DATABASE_SSL: false,
  DATABASE_URL: 'postgresql://walrus:local-password@localhost:5432/walrus',
  REDIS_HOST: 'localhost',
  REDIS_PORT: 6379,
  REDIS_PASSWORD: 'local-password',
  REDIS_DB: 0,
  LOG_LEVEL: 'info',
  LOG_FORMAT: 'json',
  METRICS_ENABLED: true,
  TRACE_ENABLED: false,
} as const;

describe('HealthService', () => {
  it('reports process liveness without probing dependencies', async () => {
    const service = new HealthService(new ConfigurationService(environment));
    expect(service.liveness()).toMatchObject({ status: 'UP', service: 'api', version: '1.0.0' });
    await service.onApplicationShutdown();
  });

  it('reports dependency readiness and failure without throwing', async () => {
    const service = new HealthService(new ConfigurationService(environment));
    const pool = {
      query: jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('down')),
      end: jest.fn(),
    };
    const redis = {
      status: 'ready',
      ping: jest.fn().mockResolvedValueOnce('PONG').mockRejectedValueOnce(new Error('down')),
      disconnect: jest.fn(),
    };
    Object.defineProperty(service, 'pool', { value: pool });
    Object.defineProperty(service, 'redis', { value: redis });
    await expect(service.readiness()).resolves.toMatchObject({ status: 'UP' });
    await expect(service.readiness()).resolves.toMatchObject({ status: 'DOWN' });
    await service.onApplicationShutdown();
    expect(redis.disconnect).toHaveBeenCalled();
    expect(pool.end).toHaveBeenCalled();
  });

  it('connects a lazy Redis client before checking readiness', async () => {
    const service = new HealthService(new ConfigurationService(environment));
    const pool = { query: jest.fn().mockResolvedValue({}), end: jest.fn() };
    const redis = {
      status: 'wait',
      connect: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
      disconnect: jest.fn(),
    };
    Object.defineProperty(service, 'pool', { value: pool });
    Object.defineProperty(service, 'redis', { value: redis });
    await service.readiness();
    expect(redis.connect).toHaveBeenCalled();
    await service.onApplicationShutdown();
  });
});
