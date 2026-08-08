import { PrismaNonProductionRateLimitRepository } from './prisma-non-production-rate-limit.repository';

describe('PrismaNonProductionRateLimitRepository', () => {
  it('allows requests within limit and enforces remaining count', async () => {
    const mockRecord = {
      rateLimitId: '11111111-1111-1111-1111-111111111111',
      rateLimitKey: 'test_key',
      requestCount: 1,
      windowStartAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prismaMock = {
      nonProductionRateLimitRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(mockRecord),
      },
    };

    const repository = new PrismaNonProductionRateLimitRepository(prismaMock as never);
    const result = await repository.consume({ key: 'test_key', limit: 10, windowSeconds: 60 });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
  });

  it('blocks requests exceeding limit', async () => {
    const existing = {
      rateLimitId: '11111111-1111-1111-1111-111111111111',
      rateLimitKey: 'test_key',
      requestCount: 10,
      windowStartAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updated = {
      ...existing,
      requestCount: 11,
    };

    const prismaMock = {
      nonProductionRateLimitRecord: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
    };

    const repository = new PrismaNonProductionRateLimitRepository(prismaMock as never);
    const result = await repository.consume({ key: 'test_key', limit: 10, windowSeconds: 60 });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
