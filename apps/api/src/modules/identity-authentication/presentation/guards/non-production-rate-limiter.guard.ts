import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMITER } from '../authentication.tokens';
import type { NonProductionRateLimiterPort } from '../../application/ports/non-production-rate-limiter.port';
import {
  RATE_LIMIT_METADATA,
  type RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { createHash } from 'node:crypto';

const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_SECONDS = 60;

@Injectable()
export class NonProductionRateLimiterGuard implements CanActivate {
  public constructor(
    @Inject(RATE_LIMITER) private readonly rateLimiter: NonProductionRateLimiterPort,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const options =
      this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? { limit: DEFAULT_LIMIT, windowSeconds: DEFAULT_WINDOW_SECONDS };

    const ip = request.ip ?? request.socket.remoteAddress ?? '127.0.0.1';
    const route = request.route as { readonly path?: string } | undefined;
    const routePath = route?.path ?? request.path;
    const keyMaterial = `${ip}:${routePath}`;
    const key = `non_prod_rl:${createHash('sha256').update(keyMaterial).digest('hex')}`;

    const result = await this.rateLimiter.consume({
      key,
      limit: options.limit,
      windowSeconds: options.windowSeconds,
    });

    response.setHeader('X-RateLimit-Limit', result.limit.toString());
    response.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    response.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt.getTime() / 1000).toString());

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
      );
      response.setHeader('Retry-After', retryAfterSeconds.toString());

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'RATE_LIMIT_EXCEEDED',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
