import { Injectable } from '@nestjs/common';
import type {
  ApiIdempotencyAcquisition,
  ApiIdempotencyPort,
  ApiIdempotencyRequest,
} from '../../../../application/ports/api-idempotency.port';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaApiIdempotencyRepository implements ApiIdempotencyPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async acquire(request: ApiIdempotencyRequest): Promise<ApiIdempotencyAcquisition> {
    try {
      await this.prisma.apiIdempotencyRecord.create({
        data: {
          apiIdempotencyId: request.recordId,
          identityOrClientScope: request.scope,
          operationType: request.operationType,
          idempotencyKey: request.idempotencyKey,
          requestFingerprint: request.requestFingerprint,
          processingState: 'PROCESSING',
          createdAt: request.createdAt,
        },
      });
      return { outcome: 'ACQUIRED' };
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
    }
    const existing = await this.prisma.apiIdempotencyRecord.findUniqueOrThrow({
      where: {
        identityOrClientScope_operationType_idempotencyKey: {
          identityOrClientScope: request.scope,
          operationType: request.operationType,
          idempotencyKey: request.idempotencyKey,
        },
      },
    });
    if (existing.requestFingerprint !== request.requestFingerprint) {
      return { outcome: 'FINGERPRINT_MISMATCH' };
    }
    if (existing.processingState === 'PROCESSING') return { outcome: 'IN_PROGRESS' };
    if (existing.responseReference === null) throw new Error('Completed idempotency result missing');
    return { outcome: 'COMPLETED', protectedResultReference: existing.responseReference };
  }

  public async complete(recordId: string, result: string, completedAt: Date): Promise<void> {
    const updated = await this.prisma.apiIdempotencyRecord.updateMany({
      where: { apiIdempotencyId: recordId, processingState: 'PROCESSING' },
      data: { processingState: 'COMPLETED', responseReference: result, completedAt },
    });
    if (updated.count !== 1) throw new Error('Idempotency completion state conflict');
  }

  public async abandon(recordId: string): Promise<void> {
    await this.prisma.apiIdempotencyRecord.deleteMany({
      where: { apiIdempotencyId: recordId, processingState: 'PROCESSING' },
    });
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
