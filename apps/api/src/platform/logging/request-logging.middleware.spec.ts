import { EventEmitter } from 'node:events';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import type { PlatformLogger } from './platform-logger.service';

describe('RequestLoggingMiddleware', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [10, 'log'],
    [1200, 'warn'],
  ] as const)('uses the correct level for a %sms request', (duration, method) => {
    jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(duration);
    const log = jest.fn();
    const warn = jest.fn();
    const logger = { log, warn } as unknown as PlatformLogger;
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    const next = jest.fn();
    new RequestLoggingMiddleware(logger).use(
      { method: 'GET', path: '/health' } as never,
      response as never,
      next,
    );
    response.emit('finish');
    expect(method === 'log' ? log : warn).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
