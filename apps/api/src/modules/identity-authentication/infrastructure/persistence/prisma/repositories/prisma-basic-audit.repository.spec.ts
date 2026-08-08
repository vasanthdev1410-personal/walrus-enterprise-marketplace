import { PrismaBasicAuditRepository } from './prisma-basic-audit.repository';

describe('PrismaBasicAuditRepository', () => {
  it('persists basic audit event record to PostgreSQL via Prisma', async () => {
    const createMock = jest.fn().mockResolvedValue({});
    const prismaMock = {
      basicAuditEventRecord: {
        create: createMock,
      },
    };

    const repository = new PrismaBasicAuditRepository(prismaMock as never);
    await repository.logEvent({
      operationType: 'M01-AUTH-001',
      subjectIdentityId: '11111111-1111-1111-1111-111111111111',
      actorIdentityId: '11111111-1111-1111-1111-111111111111',
      actionOutcome: 'SUCCESS',
      sourceIpReference: '127.0.0.1',
      userAgentReference: 'jest-test',
      correlationId: '22222222-2222-2222-2222-222222222222',
      occurredAt: new Date(),
    });

    const calls = createMock.mock.calls as unknown[][];
    expect(calls).toHaveLength(1);
    const persistedData = calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
    expect(persistedData?.data).toMatchObject({
      operationType: 'M01-AUTH-001',
      actionOutcome: 'SUCCESS',
      sourceIpReference: '127.0.0.1',
    });
  });
});
