import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from '@walrus/shared';
import type { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context';

const VALID_IDENTIFIER = /^[A-Za-z0-9._-]{1,128}$/;

function safeIdentifier(value: string | undefined): string {
  return value !== undefined && VALID_IDENTIFIER.test(value) ? value : randomUUID();
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  public use(request: Request, response: Response, next: NextFunction): void {
    const suppliedHeader = request.headers[CORRELATION_ID_HEADER];
    const suppliedCorrelationId = Array.isArray(suppliedHeader)
      ? suppliedHeader[0]
      : suppliedHeader;
    const correlationId = safeIdentifier(suppliedCorrelationId);
    const requestId = randomUUID();
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    response.setHeader(REQUEST_ID_HEADER, requestId);
    requestContextStorage.run({ correlationId, requestId }, next);
  }
}
