import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import type { CustomerRetentionDeletionPort } from '../../../../domain/ports/customer-retention-deletion.port';

/**
 * WEMP-M06-SPEC-001 §19 / decision D-15 (M06-M3). Prisma implementation of
 * the scoped retention deletion surface. Used ONLY by the
 * CustomerRetentionApplicationService after every category rule has been
 * resolved (fail closed — no deletion without a valid configured duration).
 * The aggregate repository never exposes generic update/delete for the
 * append-only transition/audit records (D-02/D-08); this adapter is the
 * sole deletion path for expired records.
 */
@Injectable()
export class PrismaCustomerRetentionDeletionRepository implements CustomerRetentionDeletionPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async deleteTransitions(transitionIds: readonly UuidV7[]): Promise<void> {
    if (transitionIds.length === 0) {
      return;
    }
    await this.prisma.customerStateTransition.deleteMany({
      where: { transitionId: { in: transitionIds.map((id) => id.value) } },
    });
  }

  public async deleteAuditRecords(auditEventIds: readonly UuidV7[]): Promise<void> {
    if (auditEventIds.length === 0) {
      return;
    }
    await this.prisma.customerAuditRecord.deleteMany({
      where: { auditEventId: { in: auditEventIds.map((id) => id.value) } },
    });
  }
}
