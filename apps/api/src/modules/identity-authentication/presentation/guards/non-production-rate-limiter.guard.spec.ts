import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { NonProductionRateLimiterGuard } from './non-production-rate-limiter.guard';

describe('NonProductionRateLimiterGuard', () => {
  it('allows request and sets rate limit response headers', async () => {
    const rateLimiterMock = {
      consume: jest.fn().mockResolvedValue({
        allowed: true,
        limit: 100,
        remaining: 99,
        resetAt: new Date(Date.now() + 60000),
      }),
    };

    const reflectorMock = {
      get: jest.fn(),
      getAll: jest.fn(),
      getAllAndMerge: jest.fn(),
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };

    const headersMap = new Map<string, string>();
    const responseMock = {
      setHeader: jest.fn((key: string, value: string) => headersMap.set(key, value)),
    };

    const requestMock = {
      ip: '127.0.0.1',
      path: '/auth/login',
      socket: { remoteAddress: '127.0.0.1' },
    };

    const contextMock = {
      switchToHttp: () => ({
        getRequest: () => requestMock,
        getResponse: () => responseMock,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    const guard = new NonProductionRateLimiterGuard(rateLimiterMock, reflectorMock);

    const allowed = await guard.canActivate(contextMock);

    expect(allowed).toBe(true);
    expect(headersMap.get('X-RateLimit-Limit')).toBe('100');
    expect(headersMap.get('X-RateLimit-Remaining')).toBe('99');
  });

  it('throws 429 Too Many Requests when rate limit exceeded', async () => {
    const rateLimiterMock = {
      consume: jest.fn().mockResolvedValue({
        allowed: false,
        limit: 5,
        remaining: 0,
        resetAt: new Date(Date.now() + 30000),
      }),
    };

    const reflectorMock = {
      get: jest.fn(),
      getAll: jest.fn(),
      getAllAndMerge: jest.fn(),
      getAllAndOverride: jest.fn().mockReturnValue({ limit: 5, windowSeconds: 60 }),
    };

    const headersMap = new Map<string, string>();
    const responseMock = {
      setHeader: jest.fn((key: string, value: string) => headersMap.set(key, value)),
    };

    const requestMock = {
      ip: '127.0.0.1',
      path: '/auth/login',
      socket: { remoteAddress: '127.0.0.1' },
    };

    const contextMock = {
      switchToHttp: () => ({
        getRequest: () => requestMock,
        getResponse: () => responseMock,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    const guard = new NonProductionRateLimiterGuard(rateLimiterMock, reflectorMock);

    await expect(guard.canActivate(contextMock)).rejects.toThrow(HttpException);
    expect(headersMap.get('Retry-After')).toBeDefined();
  });
});
