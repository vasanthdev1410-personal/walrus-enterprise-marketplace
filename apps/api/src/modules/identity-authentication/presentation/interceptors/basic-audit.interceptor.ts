import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import { BASIC_AUDIT_LOGGER } from '../authentication.tokens';
import type { BasicAuditLoggerPort } from '../../application/ports/basic-audit-logger.port';
import { currentRequestContext } from '../../../../platform/request-context/request-context';
import type { AuthenticatedRequest } from '../authentication-context';

@Injectable()
export class BasicAuditInterceptor implements NestInterceptor {
  public constructor(
    @Inject(BASIC_AUDIT_LOGGER) private readonly auditLogger: BasicAuditLoggerPort,
  ) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request & Partial<AuthenticatedRequest>>();

    const operationType = context.getHandler().name || context.getClass().name || 'HTTP_OPERATION';

    const subjectIdentityId = request.authentication?.subject;
    const sourceIpReference = request.ip ?? request.socket.remoteAddress ?? undefined;
    const userAgentReference = request.headers['user-agent'];
    const correlationId = currentRequestContext()?.correlationId;
    const occurredAt = new Date();

    return next.handle().pipe(
      tap({
        next: () => {
          void this.auditLogger.logEvent({
            operationType,
            subjectIdentityId,
            actorIdentityId: subjectIdentityId,
            actionOutcome: 'SUCCESS',
            sourceIpReference,
            userAgentReference,
            correlationId,
            occurredAt,
          });
        },
        error: (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'UNHANDLED_ERROR';
          void this.auditLogger.logEvent({
            operationType,
            subjectIdentityId,
            actorIdentityId: subjectIdentityId,
            actionOutcome: 'FAILURE',
            sourceIpReference,
            userAgentReference,
            correlationId,
            metadataJson: JSON.stringify({ error: errorMessage }),
            occurredAt,
          });
        },
      }),
    );
  }
}
