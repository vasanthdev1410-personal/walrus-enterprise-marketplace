import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import type { AuthorizationDecisionRecord } from '../../../../domain/entities/authorization-decision-record';
import type { AuthorizationDecisionRepository } from '../../../../domain/repositories/authorization-decision-repository';
import { authorizationDecisionRecordMapper } from '../mappers/authorization.mapper';

/**
 * Prisma implementation of the append-only authorization decision audit
 * repository (Part 6.5 §22). Records are immutable; only insert is supported.
 */
@Injectable()
export class PrismaAuthorizationDecisionRepository implements AuthorizationDecisionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async insert(record: AuthorizationDecisionRecord): Promise<void> {
    await this.prisma.authorizationDecisionRecord.create({
      data: authorizationDecisionRecordMapper.toPersistence(record),
    });
  }
}
