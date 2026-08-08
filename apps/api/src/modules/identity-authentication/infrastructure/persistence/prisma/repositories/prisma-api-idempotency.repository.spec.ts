import { PrismaApiIdempotencyRepository } from './prisma-api-idempotency.repository';

describe('PrismaApiIdempotencyRepository', () => {
  it('returns the committed result for an identical replay', async () => {
    const prisma = {
      apiIdempotencyRecord: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          requestFingerprint: 'fingerprint',
          processingState: 'COMPLETED',
          responseReference: 'protected-result',
        }),
      },
    };
    const result = await new PrismaApiIdempotencyRepository(prisma as never).acquire({
      recordId: 'record',
      scope: 'scope',
      operationType: 'operation',
      idempotencyKey: 'key',
      requestFingerprint: 'fingerprint',
      createdAt: new Date(),
    });
    expect(result).toEqual({ outcome: 'COMPLETED', protectedResultReference: 'protected-result' });
  });

  it('rejects reuse with a different fingerprint', async () => {
    const prisma = {
      apiIdempotencyRecord: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          requestFingerprint: 'other',
          processingState: 'COMPLETED',
          responseReference: 'protected-result',
        }),
      },
    };
    const result = await new PrismaApiIdempotencyRepository(prisma as never).acquire({
      recordId: 'record',
      scope: 'scope',
      operationType: 'operation',
      idempotencyKey: 'key',
      requestFingerprint: 'fingerprint',
      createdAt: new Date(),
    });
    expect(result).toEqual({ outcome: 'FINGERPRINT_MISMATCH' });
  });
});
