import { RequestContextMiddleware } from './request-context.middleware';

describe('RequestContextMiddleware', () => {
  it('returns safe tracing headers', () => {
    const headers = new Map<string, string>();
    const request = { headers: { 'x-correlation-id': 'trace-123' } };
    const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
    const next = jest.fn();
    new RequestContextMiddleware().use(request as never, response as never, next);
    expect(headers.get('x-correlation-id')).toBe('trace-123');
    expect(headers.get('x-request-id')).toBeDefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('replaces an unsafe supplied correlation identifier', () => {
    const headers = new Map<string, string>();
    const request = { headers: { 'x-correlation-id': 'unsafe value\n' } };
    const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
    new RequestContextMiddleware().use(request as never, response as never, jest.fn());
    expect(headers.get('x-correlation-id')).not.toBe('unsafe value\n');
  });

  it('accepts the first identifier when a proxy supplies an array', () => {
    const headers = new Map<string, string>();
    const request = { headers: { 'x-correlation-id': ['first', 'second'] } };
    const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
    new RequestContextMiddleware().use(request as never, response as never, jest.fn());
    expect(headers.get('x-correlation-id')).toBe('first');
  });
});
