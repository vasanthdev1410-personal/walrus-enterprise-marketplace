import type { ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { BasicAuditInterceptor } from './basic-audit.interceptor';

describe('BasicAuditInterceptor', () => {
  it('logs audit event on successful request completion', (done) => {
    const logEventMock = jest.fn().mockResolvedValue(undefined);
    const auditLoggerMock = { logEvent: logEventMock };

    const requestMock = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest-browser' },
      socket: { remoteAddress: '127.0.0.1' },
      authentication: { subject: '11111111-1111-1111-1111-111111111111' },
    };

    const contextMock = {
      switchToHttp: () => ({ getRequest: () => requestMock }),
      getHandler: () => ({ name: 'login' }),
      getClass: () => ({ name: 'AuthenticationController' }),
    } as unknown as ExecutionContext;

    const nextMock = {
      handle: () => of({ success: true }),
    };

    const interceptor = new BasicAuditInterceptor(auditLoggerMock);
    interceptor.intercept(contextMock, nextMock).subscribe({
      next: () => {
        expect(logEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            operationType: 'login',
            actionOutcome: 'SUCCESS',
            subjectIdentityId: '11111111-1111-1111-1111-111111111111',
          }),
        );
        done();
      },
    });
  });

  it('logs audit event on request failure', (done) => {
    const logEventMock = jest.fn().mockResolvedValue(undefined);
    const auditLoggerMock = { logEvent: logEventMock };

    const requestMock = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest-browser' },
      socket: { remoteAddress: '127.0.0.1' },
    };

    const contextMock = {
      switchToHttp: () => ({ getRequest: () => requestMock }),
      getHandler: () => ({ name: 'login' }),
      getClass: () => ({ name: 'AuthenticationController' }),
    } as unknown as ExecutionContext;

    const nextMock = {
      handle: () => throwError(() => new Error('INVALID_CREDENTIALS')),
    };

    const interceptor = new BasicAuditInterceptor(auditLoggerMock);
    interceptor.intercept(contextMock, nextMock).subscribe({
      error: () => {
        expect(logEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            operationType: 'login',
            actionOutcome: 'FAILURE',
            metadataJson: JSON.stringify({ error: 'INVALID_CREDENTIALS' }),
          }),
        );
        done();
      },
    });
  });
});
