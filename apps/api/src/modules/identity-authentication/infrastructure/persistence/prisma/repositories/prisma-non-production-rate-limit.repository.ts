import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  NonProductionRateLimiterPort,
  RateLimitCheckResult,
} from '../../../../application/ports/non-production-rate-limiter.port';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaNonProductionRateLimitRepository implements NonProductionRateLimiterPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async consume(params: {
    readonly key: string;
    readonly limit: number;
    readonly windowSeconds: number;
  }): Promise<RateLimitCheckResult> {
    const now = new Date();
    const windowMs = params.windowSeconds * 1000;
    const windowExpiresAt = new Date(now.getTime() + windowMs);

    const existing = await this.prisma.nonProductionRateLimitRecord.findUnique({
      where: { rateLimitKey: params.key },
    });

    if (!existing || existing.expiresAt <= now) {
      const record = await this.prisma.nonProductionRateLimitRecord.upsert({
        where: { rateLimitKey: params.key },
        create: {
          rateLimitId: randomUUID(),
          rateLimitKey: params.key,
          requestCount: 1,
          windowStartAt: now,
          expiresAt: windowExpiresAt,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          requestCount: 1,
          windowStartAt: now,
          expiresAt: windowExpiresAt,
          updatedAt: now,
        },
      });
      return {
        allowed: 1 <= params.limit,
        limit: params.limit,
        remaining: Math.max(0, params.limit - 1),
        resetAt: record.expiresAt,
      };
    }

    const updated = await this.prisma.nonProductionRateLimitRecord.update({
      where: { rateLimitKey: params.key },
      data: {
        requestCount: { increment: 1 },
        updatedAt: now,
      },
    });

    const allowed = updated.requestCount <= params.limit;
    const remaining = Math.max(0, params.limit - updated.requestCount);

    return {
      allowed,
      limit: params.limit,
      remaining,
      resetAt: updated.expiresAt,
    };
  }
}
