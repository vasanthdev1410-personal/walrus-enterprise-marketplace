import { Injectable } from '@nestjs/common';
import { OptimisticConcurrencyError } from '../../../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import type { AuthorizationMutationPort } from '../../../../application/ports/authorization-mutation.port';
import type { AuthorizationDecisionRecord } from '../../../../domain/entities/authorization-decision-record';
import type { IdentityRoleAssignment } from '../../../../domain/entities/identity-role-assignment';
import {
  authorizationDecisionRecordMapper,
  identityRoleAssignmentMapper,
} from '../mappers/authorization.mapper';

/** Prisma transaction boundary for role state and its mandatory audit record. */
@Injectable()
export class PrismaAuthorizationMutationRepository implements AuthorizationMutationPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async assignRoleWithAudit(
    assignment: IdentityRoleAssignment,
    auditRecord: AuthorizationDecisionRecord,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.identityRoleAssignment.create({
        data: identityRoleAssignmentMapper.toPersistence(assignment),
      });
      await transaction.authorizationDecisionRecord.create({
        data: authorizationDecisionRecordMapper.toPersistence(auditRecord),
      });
    });
  }

  public async revokeRoleWithAudit(
    assignment: IdentityRoleAssignment,
    auditRecord: AuthorizationDecisionRecord,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const value = assignment.properties;
      const updated = await transaction.identityRoleAssignment.updateMany({
        where: {
          assignmentId: value.assignmentId.value,
          aggregateVersion: value.aggregateVersion.value - 1,
          assignmentState: 'ACTIVE',
        },
        data: identityRoleAssignmentMapper.toPersistence(assignment),
      });
      if (updated.count !== 1) {
        throw new OptimisticConcurrencyError('IdentityRoleAssignment');
      }
      await transaction.authorizationDecisionRecord.create({
        data: authorizationDecisionRecordMapper.toPersistence(auditRecord),
      });
    });
  }
}
