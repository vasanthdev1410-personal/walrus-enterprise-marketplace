import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { assertVersionUpdated } from '../../../../../identity-authentication/infrastructure/persistence/prisma/repositories/repository-support';
import type { IdentityRoleAssignment } from '../../../../domain/entities/identity-role-assignment';
import type { IdentityRoleAssignmentRepository } from '../../../../domain/repositories/identity-role-assignment-repository';
import { identityRoleAssignmentMapper } from '../mappers/authorization.mapper';

/**
 * Prisma implementation of the identity-role assignment repository (Part 6.2
 * §6/§9). Writes are version-checked: save() only applies when the caller's
 * aggregate version is current, otherwise an OptimisticConcurrencyError is
 * raised so stale or concurrent changes are rejected.
 */
@Injectable()
export class PrismaIdentityRoleAssignmentRepository implements IdentityRoleAssignmentRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(assignmentId: UuidV7): Promise<IdentityRoleAssignment | null> {
    const record = await this.prisma.identityRoleAssignment.findUnique({
      where: { assignmentId: assignmentId.value },
    });
    return record === null ? null : identityRoleAssignmentMapper.toDomain(record);
  }

  public async findByIdentityId(identityId: UuidV7): Promise<readonly IdentityRoleAssignment[]> {
    const records = await this.prisma.identityRoleAssignment.findMany({
      where: { identityId: identityId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => identityRoleAssignmentMapper.toDomain(record));
  }

  public async findActiveByIdentityId(
    identityId: UuidV7,
  ): Promise<readonly IdentityRoleAssignment[]> {
    const records = await this.prisma.identityRoleAssignment.findMany({
      where: { identityId: identityId.value, assignmentState: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => identityRoleAssignmentMapper.toDomain(record));
  }

  public async insert(assignment: IdentityRoleAssignment): Promise<void> {
    await this.prisma.identityRoleAssignment.create({
      data: identityRoleAssignmentMapper.toPersistence(assignment),
    });
  }

  public async save(assignment: IdentityRoleAssignment): Promise<void> {
    const persistence = identityRoleAssignmentMapper.toPersistence(assignment);
    const result = await this.prisma.identityRoleAssignment.updateMany({
      where: {
        assignmentId: assignment.properties.assignmentId.value,
        aggregateVersion: assignment.properties.aggregateVersion.value - 1,
      },
      data: { ...persistence, aggregateVersion: assignment.properties.aggregateVersion.value },
    });
    assertVersionUpdated(result.count, 'IdentityRoleAssignment');
  }
}
