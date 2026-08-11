import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { AuthorizationDecisionRecord } from '../../../../domain/entities/authorization-decision-record';
import { PrismaAuthorizationDecisionRepository } from './prisma-authorization-decision.repository';

const SUBJECT = new UuidV7('0191310f-789a-7123-8123-000000000001');
const NOW = new Date('2026-08-11T00:00:00.000Z');

describe('PrismaAuthorizationDecisionRepository (M02 persistence)', () => {
  it('inserts an immutable decision audit record', async () => {
    const create = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const prisma = {
      authorizationDecisionRecord: { create },
    } as unknown as PrismaService;
    const record = new AuthorizationDecisionRecord({
      authorizationReference: 'azr:0123456789abcdef0123456789abcdef',
      subjectIdentityId: SUBJECT,
      permissionId: 'recovery.approval.decide',
      decisionOutcome: 'GRANTED',
      decidedAt: NOW,
      createdAt: NOW,
    });

    await new PrismaAuthorizationDecisionRepository(prisma).insert(record);

    expect(create).toHaveBeenCalledTimes(1);
    const calledData = (create.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined)
      ?.data;
    expect(calledData).toMatchObject({
      authorizationReference: 'azr:0123456789abcdef0123456789abcdef',
      subjectIdentityId: SUBJECT.value,
      permissionId: 'recovery.approval.decide',
      decisionOutcome: 'GRANTED',
    });
  });
});
