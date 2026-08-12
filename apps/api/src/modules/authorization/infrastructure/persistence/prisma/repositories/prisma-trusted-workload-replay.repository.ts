import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../../generated/prisma/client';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../../../identity-authentication/application/ports/application-runtime.port';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import type { TrustedWorkloadReplayPort } from '../../../../application/ports/trusted-workload.port';
import { TrustedBoundaryError } from '../../../../application/errors/trusted-boundary.error';
import {
  CLOCK,
  UUID_V7_GENERATOR,
} from '../../../../../identity-authentication/identity-authentication.tokens';

@Injectable()
export class PrismaTrustedWorkloadReplayRepository implements TrustedWorkloadReplayPort {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(UUID_V7_GENERATOR) private readonly identifiers: UuidV7GenerationPort,
  ) {}

  public async consume(input: Parameters<TrustedWorkloadReplayPort['consume']>[0]): Promise<void> {
    const now = this.clock.now();
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.trustedWorkloadReplayRecord.create({
          data: {
            replayRecordId: this.identifiers.next().value,
            environment: input.environment,
            jwtId: input.jwtId,
            workloadSubject: input.workloadSubject,
            boundary: input.boundary,
            assertionDigest: input.assertionDigest,
            requestDigest: input.requestDigest,
            certificateThumbprint: input.certificateThumbprint,
            operationId: input.operationId,
            expiresAt: input.expiresAt,
            consumedAt: now,
            auditReference: input.auditReference,
            createdAt: now,
          },
        });
        await transaction.basicAuditEventRecord.create({
          data: {
            auditEventId: this.identifiers.next().value,
            operationType: 'authorization.workload.verify',
            actionOutcome: 'GRANTED',
            correlationId: input.operationId,
            metadataJson: JSON.stringify({
              schemaVersion: 'walrus.authorization-audit.v1',
              verificationReference: input.auditReference,
              workloadIdentity: input.workloadSubject,
              boundary: input.boundary,
              environment: input.environment,
            }),
            occurredAt: now,
            createdAt: now,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new TrustedBoundaryError('WI_REPLAY');
      }
      throw error;
    }
  }
}
