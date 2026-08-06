import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@walrus/types';
import type { Response } from 'express';
import { PlatformLogger } from '../logging/platform-logger.service';
import { currentRequestContext } from '../request-context/request-context';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  public constructor(private readonly logger: PlatformLogger) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const context = currentRequestContext() ?? {
      correlationId: 'unavailable',
      requestId: 'unavailable',
    };
    const payload: ApiErrorResponse = {
      success: false,
      message: status >= 500 ? 'An unexpected error occurred.' : this.safeMessage(exception),
      errorCode: this.errorCode(status),
      errors: [],
      correlationId: context.correlationId,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
    };
    this.logger.error(
      exception,
      exception instanceof Error ? exception.stack : undefined,
      'ExceptionFilter',
    );
    response.status(status).json(payload);
  }

  private safeMessage(exception: unknown): string {
    return exception instanceof HttpException ? exception.message : 'Request failed.';
  }

  private errorCode(status: number): string {
    return status === 404
      ? 'RESOURCE_NOT_FOUND'
      : status === 400
        ? 'VALIDATION_ERROR'
        : 'UNEXPECTED_ERROR';
  }
}
