import { Injectable } from '@nestjs/common';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import type { CustomerAuditRecord } from '../../../../domain/entities/customer-audit-record';
import type { CustomerProfile } from '../../../../domain/entities/customer-profile';
import type { CustomerStateTransition } from '../../../../domain/entities/customer-state-transition';
import type { CustomerAdminReadRepository } from '../../../../domain/ports/customer-admin-read.port';
import {
  customerAuditRecordMapper,
  customerProfileMapper,
  customerStateTransitionMapper,
} from '../mappers/customer.mapper';

/**
 * WEMP-M06-SPEC-001 §14 (M06-M5). Prisma implementation of the admin
 * customer READ repository. Deliberately a separate class from
 * `PrismaCustomerProfileRepository`: the aggregate repository keeps its A-06
 * isolation guarantee (no wildcard cross-customer shortcuts on the
 * mutation/aggregate path), while this read-only adapter serves only the
 * admin read application service, which gates every query on the Module 02
 * admin grants before calling in. Read-only: it never inserts, updates, or
 * deletes any row, and it never touches Module 01/02 storage (A-06).
 */
@Injectable()
export class PrismaCustomerAdminReadRepository implements CustomerAdminReadRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findAllProfiles(): Promise<readonly CustomerProfile[]> {
    const records = await this.prisma.customerProfile.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => customerProfileMapper.toDomain(record));
  }

  public async findProfile(customerProfileId: UuidV7): Promise<CustomerProfile | null> {
    const record = await this.prisma.customerProfile.findUnique({
      where: { customerProfileId: customerProfileId.value },
    });
    return record === null ? null : customerProfileMapper.toDomain(record);
  }

  public async findAuditRecords(
    customerProfileId: UuidV7,
  ): Promise<readonly CustomerAuditRecord[]> {
    const records = await this.prisma.customerAuditRecord.findMany({
      where: { customerProfileId: customerProfileId.value },
      orderBy: { occurredAt: 'asc' },
    });
    return records.map((record) => customerAuditRecordMapper.toDomain(record));
  }

  public async findTransitions(
    customerProfileId: UuidV7,
  ): Promise<readonly CustomerStateTransition[]> {
    const records = await this.prisma.customerStateTransition.findMany({
      where: { customerProfileId: customerProfileId.value },
      orderBy: { stateVersion: 'asc' },
    });
    return records.map((record) => customerStateTransitionMapper.toDomain(record));
  }
}
