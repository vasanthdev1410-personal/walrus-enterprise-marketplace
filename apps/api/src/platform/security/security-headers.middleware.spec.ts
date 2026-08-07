import type { NextFunction, Request, Response } from 'express';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

function run(secure = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response;
  const request = { secure } as Request;
  const next: NextFunction = jest.fn();
  new SecurityHeadersMiddleware().use(request, response, next);
  return headers;
}

describe('SecurityHeadersMiddleware', () => {
  it('sets the OWASP-aligned baseline headers on every response', () => {
    const headers = run();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['X-Permitted-Cross-Domain-Policies']).toBe('none');
    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('emits Strict-Transport-Security only over HTTPS', () => {
    expect(run(true)['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('delegates to the next handler', () => {
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;
    const next: NextFunction = jest.fn();
    new SecurityHeadersMiddleware().use({ secure: false } as Request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
