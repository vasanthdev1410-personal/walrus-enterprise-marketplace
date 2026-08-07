import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  BasicAuditEvent,
  BasicAuditLoggerPort,
} from '../../../../application/ports/basic-audit-logger.port';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaBasicAuditRepository implements BasicAuditLoggerPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async logEvent(event: BasicAuditEvent): Promise<void> {
    await this.prisma.basicAuditEventRecord.create({
      data: {
        auditEventId: randomUUID(),
        operationType: event.operationType,
        subjectIdentityId: event.subjectIdentityId ?? null,
        actorIdentityId: event.actorIdentityId ?? null,
        actionOutcome: event.actionOutcome,
        sourceIpReference: event.sourceIpReference ?? null,
        userAgentReference: event.userAgentReference ?? null,
        correlationId: event.correlationId ?? null,
        metadataJson: event.metadataJson ?? null,
        occurredAt: event.occurredAt,
        createdAt: new Date(),
      },
    });
  }
}
