import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PlatformLogger } from './platform-logger.service';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  public constructor(private readonly logger: PlatformLogger) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = performance.now();
    response.on('finish', () => {
      const durationMs = Math.round(performance.now() - startedAt);
      const message = `${request.method} ${request.path} ${String(response.statusCode)} ${String(durationMs)}ms`;
      if (durationMs > 1000) this.logger.warn(message, 'HttpRequest');
      else this.logger.log(message, 'HttpRequest');
    });
    next();
  }
}
