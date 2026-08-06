import { HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import type { PlatformLogger } from '../logging/platform-logger.service';

function harness(exception: unknown): {
  json: jest.Mock;
  logger: PlatformLogger;
  status: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const logger = { error: jest.fn() } as unknown as PlatformLogger;
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  };
  new GlobalExceptionFilter(logger).catch(exception, host as never);
  return { json, logger, status };
}

describe('GlobalExceptionFilter', () => {
  it('returns a safe response for unexpected failures', () => {
    const result = harness(new Error('database credentials leaked'));
    expect(result.status).toHaveBeenCalledWith(500);
    expect(result.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'UNEXPECTED_ERROR',
        message: 'An unexpected error occurred.',
      }),
    );
  });

  it.each([
    [HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR'],
    [HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND'],
    [HttpStatus.CONFLICT, 'UNEXPECTED_ERROR'],
  ])('maps HTTP %s without exposing stack traces', (statusCode, errorCode) => {
    const result = harness(new HttpException('safe message', statusCode));
    expect(result.status).toHaveBeenCalledWith(statusCode);
    expect(result.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode, message: 'safe message' }),
    );
  });
});
