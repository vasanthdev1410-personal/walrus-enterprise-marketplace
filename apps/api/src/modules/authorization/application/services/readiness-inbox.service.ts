import { Inject, Injectable } from '@nestjs/common';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import {
  CLOCK,
  UUID_V7_GENERATOR,
} from '../../../identity-authentication/identity-authentication.tokens';
import type { VerifiedWorkloadIdentityV1 } from '../contracts/trusted-boundary-v2';
import { TrustedBoundaryError } from '../errors/trusted-boundary.error';
import { PrismaService } from '../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { SignedBoundaryEvidenceService } from '../../infrastructure/trusted-workload/signed-boundary-evidence.service';
import { PrivilegedActivationService } from './privileged-activation.service';

@Injectable()
export class ReadinessInboxService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly activation: PrivilegedActivationService,
    private readonly evidence: SignedBoundaryEvidenceService,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(UUID_V7_GENERATOR) private readonly identifiers: UuidV7GenerationPort,
  ) {}

  public async receive(input: {
    readonly messageId: string;
    readonly sagaId: string;
    readonly expectedSagaVersion: number;
    readonly compactAttestation: string;
    readonly workload: VerifiedWorkloadIdentityV1;
  }): Promise<{ readonly assignmentId: string; readonly duplicate: boolean }> {
    const saga = await this.prisma.privilegedActivationSaga.findUnique({
      where: { sagaId: input.sagaId },
    });
    if (
      saga?.environment !== input.workload.environment ||
      saga.operationId !== input.workload.operationId
    )
      throw new TrustedBoundaryError('READINESS_BINDING_MISMATCH');
    if (saga.requestedRole !== 'ADMIN' && saga.requestedRole !== 'SUPER_ADMIN')
      throw new TrustedBoundaryError('READINESS_BINDING_MISMATCH');
    const expectedAudience =
      saga.sagaType === 'FIRST_SUPER_ADMIN_BOOTSTRAP'
        ? 'urn:walrus:control-plane:bootstrap'
        : 'urn:walrus:orchestrator:privileged-provisioning';
    const verified = await this.evidence.verifyReadiness({
      compact: input.compactAttestation,
      environment: input.workload.environment,
      expectedAudience,
      operationId: saga.operationId,
      expectedRequestId: saga.requestId,
      expectedIdentityId: saga.targetIdentityId,
      expectedClassification: saga.requestedClassification,
      now: this.clock.now(),
    });
    const prior = await this.prisma.identityReadinessInbox.findFirst({
      where: {
        environment: saga.environment,
        OR: [
          { messageId: input.messageId },
          { sagaId: saga.sagaId, attestationDigest: verified.digest },
        ],
      },
    });
    if (prior !== null) {
      if (prior.sagaId !== saga.sagaId || prior.attestationDigest !== verified.digest)
        throw new TrustedBoundaryError('READINESS_REPLAY_CONFLICT');
      if (prior.result === 'COMPLETED' && saga.roleAssignmentId !== null)
        return { assignmentId: saga.roleAssignmentId, duplicate: true };
      throw new TrustedBoundaryError('READINESS_RECONCILIATION_REQUIRED');
    }
    const now = this.clock.now();
    await this.prisma.identityReadinessInbox.create({
      data: {
        inboxId: this.identifiers.next().value,
        environment: saga.environment,
        messageId: input.messageId,
        sagaId: saga.sagaId,
        attestationDigest: verified.digest,
        verificationReference: verified.verificationReference,
        observedSagaVersion: input.expectedSagaVersion,
        result: 'RECEIVED',
        receivedAt: now,
      },
    });
    try {
      const assignmentId = await this.activation.complete({
        sagaId: saga.sagaId,
        expectedSagaVersion: input.expectedSagaVersion,
        workloadIdentity: input.workload.subject,
        readiness: {
          attestationId: verified.jwtId,
          jwtId: verified.jwtId,
          attestationDigest: verified.digest,
          verificationReference: verified.verificationReference,
          targetIdentityId: verified.identityId,
          operationId: verified.operationId,
          requestedRole: saga.requestedRole,
          effectiveClassification: verified.classification,
          identityVersion: verified.identityVersion,
          readinessControlVersion: verified.controlVersion,
          issuedAt: verified.issuedAt,
          expiresAt: verified.expiresAt,
        },
        auditReference: `readiness:${saga.sagaId}:${verified.jwtId}`,
      });
      await this.prisma.identityReadinessInbox.update({
        where: {
          environment_messageId: { environment: saga.environment, messageId: input.messageId },
        },
        data: {
          result: 'COMPLETED',
          resultingSagaVersion: input.expectedSagaVersion + 1,
          processedAt: this.clock.now(),
        },
      });
      return { assignmentId, duplicate: false };
    } catch (error) {
      await this.prisma.identityReadinessInbox.update({
        where: {
          environment_messageId: { environment: saga.environment, messageId: input.messageId },
        },
        data: { result: 'RECONCILIATION_REQUIRED', processedAt: this.clock.now() },
      });
      throw error;
    }
  }
}
