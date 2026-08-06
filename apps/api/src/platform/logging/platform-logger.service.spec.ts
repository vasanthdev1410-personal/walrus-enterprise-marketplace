import { PlatformLogger } from './platform-logger.service';
import { ConfigurationService } from '../configuration/configuration.service';

const environment = {
  APP_NAME: 'WALRUS',
  APP_ENV: 'test',
  APP_VERSION: '1.0.0',
  API_PORT: 4000,
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
  LOG_LEVEL: 'trace',
  LOG_FORMAT: 'json',
  METRICS_ENABLED: true,
  TRACE_ENABLED: false,
} as const;

describe('PlatformLogger', () => {
  it('delegates every approved severity to structured pino logging', () => {
    const logger = new PlatformLogger(new ConfigurationService(environment));
    const sink = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
    };
    Object.defineProperty(logger, 'logger', { value: sink });
    logger.log('info', 'Test');
    logger.error(new Error('error'), 'trace', 'Test');
    logger.warn('warn');
    logger.debug('debug');
    logger.verbose('trace');
    logger.fatal('fatal');
    expect(sink.info).toHaveBeenCalled();
    expect(sink.error).toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalled();
    expect(sink.debug).toHaveBeenCalled();
    expect(sink.trace).toHaveBeenCalled();
    expect(sink.fatal).toHaveBeenCalled();
  });
});
