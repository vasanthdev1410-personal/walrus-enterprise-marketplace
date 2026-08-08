import type { ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import type { BasicAuditLoggerPort } from '../../application/ports/basic-audit-logger.port';
import { BasicAuditInterceptor } from './basic-audit.interceptor';

describe('BasicAuditInterceptor', () => {
  const handler = { name: 'registerIdentity' };
  const controller = { name: 'RegistrationController' };
  const logEvent = jest.fn().mockResolvedValue(undefined);
  const auditLogger = { logEvent } as unknown as BasicAuditLoggerPort;

  function createContext(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => controller,
    } as unknown as ExecutionContext;
  }

  it('logs a SUCCESS event for completed requests', () => {
    const request = {
      authentication: { subject: '018f22e2-79b0-7cc3-8c5e-000000000201' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
    };
    const interceptor = new BasicAuditInterceptor(auditLogger);

    interceptor
      .intercept(createContext(request), { handle: () => of('result') })
      .subscribe(() => undefined);

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'registerIdentity',
        actionOutcome: 'SUCCESS',
        subjectIdentityId: '018f22e2-79b0-7cc3-8c5e-000000000201',
        actorIdentityId: '018f22e2-79b0-7cc3-8c5e-000000000201',
        sourceIpReference: '127.0.0.1',
        userAgentReference: 'test-agent',
      }),
    );
  });

  it('falls back to the socket address when no request IP is present', () => {
    const request = {
      socket: { remoteAddress: '10.0.0.1' },
      headers: {},
    };
    const interceptor = new BasicAuditInterceptor(auditLogger);

    interceptor
      .intercept(createContext(request), { handle: () => of('result') })
      .subscribe(() => undefined);

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sourceIpReference: '10.0.0.1' }),
    );
  });

  it('logs a FAILURE event with the error message for failed requests', () => {
    const request = { socket: {}, headers: {} };
    const interceptor = new BasicAuditInterceptor(auditLogger);

    interceptor
      .intercept(createContext(request), {
        handle: () => throwError(() => new Error('boom')),
      })
      .subscribe({ error: () => undefined });

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionOutcome: 'FAILURE',
        metadataJson: JSON.stringify({ error: 'boom' }),
      }),
    );
  });

  it('logs a generic failure when the error is not an Error instance', () => {
    const request = { socket: {}, headers: {} };
    const interceptor = new BasicAuditInterceptor(auditLogger);

    interceptor
      .intercept(createContext(request), { handle: () => throwError(() => 'string-error') })
      .subscribe({ error: () => undefined });

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionOutcome: 'FAILURE',
        metadataJson: JSON.stringify({ error: 'UNHANDLED_ERROR' }),
      }),
    );
  });
});
