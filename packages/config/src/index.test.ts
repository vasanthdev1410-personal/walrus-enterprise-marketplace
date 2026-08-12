import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './index.js';

const valid = {
  DATABASE_PASSWORD: 'local-password',
  DATABASE_URL: 'postgresql://walrus:local-password@localhost:5432/walrus',
  DATABASE_SSL: 'true',
  METRICS_ENABLED: 'false',
  REDIS_PASSWORD: 'local-password',
  TRACE_ENABLED: 'true',
};

describe('validateEnvironment', () => {
  it('applies safe local defaults', () => {
    const environment = validateEnvironment(valid);
    expect(environment.API_PORT).toBe(4000);
    expect(environment.DATABASE_SSL).toBe(true);
    expect(environment.METRICS_ENABLED).toBe(false);
    expect(environment.INTERNAL_MTLS_ENABLED).toBe(false);
    expect(environment.INTERNAL_MTLS_CA_PATHS).toBe('[]');
  });

  it('rejects missing secrets', () => {
    expect(() => validateEnvironment({})).toThrow('Invalid environment configuration');
  });
});
