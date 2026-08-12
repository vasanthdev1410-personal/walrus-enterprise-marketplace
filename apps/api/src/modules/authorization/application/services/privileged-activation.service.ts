import { Inject, Injectable } from '@nestjs/common';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import {
  CLOCK,
  UUID_V7_GENERATOR,
} from '../../../identity-authentication/identity-authentication.tokens';
import { PrismaService } from '../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import type { RoleName } from '../../domain/value-objects/role-name';
import { TrustedBoundaryError } from '../errors/trusted-boundary.error';

export interface BeginActivationCommand {
  readonly operationId: string;
  readonly requestId: string;
  readonly sagaType:
    'ADMIN_PROVISIONING' | 'SUPER_ADMIN_PROVISIONING' | 'FIRST_SUPER_ADMIN_BOOTSTRAP';
  readonly targetIdentityId: string;
  readonly requestedRole: 'ADMIN' | 'SUPER_ADMIN';
  readonly requestedClassification:
    'PRIVILEGED_ADMIN_AUTHENTICATION' | 'SUPER_ADMIN_AUTHENTICATION';
  readonly environment: string;
  readonly authorityReference: string;
  readonly expiresAt: Date;
}

export interface CompleteActivationCommand {
  readonly sagaId: string;
  readonly expectedSagaVersion: number;
  readonly workloadIdentity: string;
  readonly readiness: {
    readonly attestationId: string;
    readonly jwtId: string;
    readonly attestationDigest: string;
    readonly verificationReference: string;
    readonly targetIdentityId: string;
    readonly operationId: string;
    readonly requestedRole: 'ADMIN' | 'SUPER_ADMIN';
    readonly effectiveClassification: string;
    readonly identityVersion: number;
    readonly readinessControlVersion: number;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
  };
  readonly auditReference: string;
}

@Injectable()
export class PrivilegedActivationService {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(UUID_V7_GENERATOR) private readonly identifiers: UuidV7GenerationPort,
  ) {}

  public async begin(command: BeginActivationCommand): Promise<string> {
    const now = this.clock.now();
    if (command.expiresAt <= now) throw new TrustedBoundaryError('ACTIVATION_EXPIRED');
    const expected =
      command.requestedRole === 'ADMIN'
        ? 'PRIVILEGED_ADMIN_AUTHENTICATION'
        : 'SUPER_ADMIN_AUTHENTICATION';
    if (command.requestedClassification !== expected) {
      throw new TrustedBoundaryError('ROLE_CLASSIFICATION_MISMATCH');
    }
    const sagaId = this.identifiers.next().value;
    const existing = await this.prisma.privilegedActivationSaga.findUnique({
      where: {
        environment_operationId: {
          environment: command.environment,
          operationId: command.operationId,
        },
      },
    });
    if (existing !== null) {
      if (
        existing.targetIdentityId !== command.targetIdentityId ||
        existing.authorityReference !== command.authorityReference
      ) {
        throw new TrustedBoundaryError('IDEMPOTENCY_CONFLICT');
      }
      return existing.sagaId;
    }
    await this.prisma.privilegedActivationSaga.create({
      data: {
        sagaId,
        operationId: command.operationId,
        requestId: command.requestId,
        sagaType: command.sagaType,
        targetIdentityId: command.targetIdentityId,
        requestedRole: command.requestedRole,
        requestedClassification: command.requestedClassification,
        environment: command.environment,
        sagaState: 'AWAITING_IDENTITY_ACTIVATION',
        completedSteps: ['AUTHORITY_VERIFIED', 'IDENTITY_PREPARED'],
        authorityReference: command.authorityReference,
        expiresAt: command.expiresAt,
        aggregateVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
    });
    return sagaId;
  }

  public async complete(command: CompleteActivationCommand): Promise<string> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (transaction) => {
      const saga = await transaction.privilegedActivationSaga.findUnique({
        where: { sagaId: command.sagaId },
      });
      if (saga === null) throw new TrustedBoundaryError('SAGA_NOT_FOUND');
      if (saga.sagaState === 'COMPLETED' && saga.roleAssignmentId !== null)
        return saga.roleAssignmentId;
      if (
        saga.aggregateVersion !== command.expectedSagaVersion ||
        saga.sagaState !== 'AWAITING_IDENTITY_ACTIVATION'
      ) {
        throw new TrustedBoundaryError('STALE_SAGA_VERSION');
      }
      if (
        saga.expiresAt <= now ||
        command.readiness.expiresAt <= now ||
        command.readiness.issuedAt > now
      ) {
        throw new TrustedBoundaryError('READINESS_EXPIRED');
      }
      if (command.readiness.expiresAt.getTime() - command.readiness.issuedAt.getTime() > 300_000) {
        throw new TrustedBoundaryError('READINESS_LIFETIME_INVALID');
      }
      if (
        saga.targetIdentityId !== command.readiness.targetIdentityId ||
        saga.operationId !== command.readiness.operationId ||
        saga.requestedRole !== command.readiness.requestedRole ||
        saga.requestedClassification !== command.readiness.effectiveClassification
      )
        throw new TrustedBoundaryError('READINESS_BINDING_MISMATCH');

      if (saga.sagaType === 'FIRST_SUPER_ADMIN_BOOTSTRAP') {
        const bootstrap = await transaction.bootstrapControlRecord.findUnique({
          where: { environment: saga.environment },
        });
        if (
          bootstrap === null ||
          bootstrap.permanentlyClosed ||
          bootstrap.operationId !== saga.operationId ||
          bootstrap.intendedIdentityId !== saga.targetIdentityId ||
          bootstrap.lifecycleState !== 'RESERVED'
        ) {
          throw new TrustedBoundaryError('BOOTSTRAP_UNAVAILABLE');
        }
        const activeSuperAdmins = await transaction.identityRoleAssignment.count({
          where: { roleName: 'SUPER_ADMIN', assignmentState: 'ACTIVE' },
        });
        if (activeSuperAdmins !== 0) throw new TrustedBoundaryError('BOOTSTRAP_SUPER_ADMIN_EXISTS');
      }

      const assignmentId = this.identifiers.next().value;
      await transaction.identityReadinessAttestation.create({
        data: {
          attestationId: command.readiness.attestationId,
          environment: saga.environment,
          jwtId: command.readiness.jwtId,
          sagaId: saga.sagaId,
          operationId: saga.operationId,
          targetIdentityId: saga.targetIdentityId,
          requestedRole: saga.requestedRole,
          effectiveClassification: command.readiness.effectiveClassification,
          identityVersion: command.readiness.identityVersion,
          readinessControlVersion: command.readiness.readinessControlVersion,
          attestationDigest: command.readiness.attestationDigest,
          verificationReference: command.readiness.verificationReference,
          issuedAt: command.readiness.issuedAt,
          expiresAt: command.readiness.expiresAt,
          consumedAt: now,
          createdAt: now,
        },
      });
      await transaction.identityRoleAssignment.create({
        data: {
          assignmentId,
          identityId: saga.targetIdentityId,
          roleName: saga.requestedRole,
          assignmentState: 'ACTIVE',
          assignedByIdentityId: null,
          assignmentOriginType:
            saga.sagaType === 'FIRST_SUPER_ADMIN_BOOTSTRAP'
              ? 'CONTROLLED_BOOTSTRAP'
              : 'PRIVILEGED_PROVISIONING',
          assignedByWorkloadIdentity: command.workloadIdentity,
          authorityEvidenceReference: saga.authorityReference,
          operationId: saga.operationId,
          auditCorrelationId: saga.operationId,
          assignedAt: now,
          activatedAt: now,
          aggregateVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.authorizationDecisionRecord.create({
        data: {
          authorizationReference: command.auditReference,
          actorIdentityId: null,
          subjectIdentityId: saga.targetIdentityId,
          targetIdentityId: saga.targetIdentityId,
          permissionId:
            saga.sagaType === 'FIRST_SUPER_ADMIN_BOOTSTRAP'
              ? 'authorization.bootstrap.execute'
              : 'identity.privileged.provision',
          decisionOutcome: 'GRANTED',
          workloadIdentity: command.workloadIdentity,
          action: 'authorization.role.activate',
          resourceType: 'IdentityRoleAssignment',
          resourceReference: assignmentId,
          reasonCode: 'READINESS_AND_AUTHORITY_VERIFIED',
          policyVersion: 'wemp.m02.m4.v1',
          contractVersion: 'wemp.m01-m02.authorization.v2',
          environment: saga.environment,
          correlationId: saga.operationId,
          decidedAt: now,
          createdAt: now,
          schemaVersion: 'walrus.authorization-audit.v1',
          evaluatedRoleNames: [],
        },
      });
      if (saga.sagaType === 'FIRST_SUPER_ADMIN_BOOTSTRAP') {
        const authority = await transaction.bootstrapControlRecord.findUnique({
          where: { environment: saga.environment },
        });
        if (authority === null) throw new TrustedBoundaryError('BOOTSTRAP_UNAVAILABLE');
        for (const [index, participant] of [
          { type: 'SECURITY', id: authority.securityAuthorityId },
          { type: 'OPERATIONS', id: authority.operationsAuthorityId },
        ].entries()) {
          await transaction.authorizationAuditParticipant.create({
            data: {
              auditParticipantId: this.identifiers.next().value,
              authorizationReference: command.auditReference,
              participantOrder: index + 1,
              authorityType: participant.type,
              authorityId: participant.id,
              assurance: null,
              evidenceReference: saga.authorityReference,
              recordedAt: now,
            },
          });
        }
      } else {
        const approvals = await transaction.authorizationApprovalRecord.findMany({
          where: { operationId: saga.operationId, decision: 'APPROVE' },
          orderBy: { approvedAt: 'asc' },
        });
        if (approvals.length === 0) throw new TrustedBoundaryError('PROVISIONING_QUORUM_INVALID');
        for (const [index, approval] of approvals.entries()) {
          await transaction.authorizationAuditParticipant.create({
            data: {
              auditParticipantId: this.identifiers.next().value,
              authorizationReference: command.auditReference,
              participantOrder: index + 1,
              authorityType: approval.authorityType,
              authorityId: approval.authorityId,
              assurance: approval.assurance,
              evidenceReference: approval.evidenceDigest,
              recordedAt: now,
            },
          });
        }
      }
      await transaction.privilegedAccessEligibilityRecord.create({
        data: {
          eligibilityRecordId: this.identifiers.next().value,
          identityId: saga.targetIdentityId,
          roleName: saga.requestedRole,
          classification: saga.requestedClassification,
          environment: saga.environment,
          sagaId: saga.sagaId,
          assignmentId,
          attestationReference: command.readiness.verificationReference,
          auditReference: command.auditReference,
          eligibilityState: 'ELIGIBLE',
          reasonCode: 'SAGA_COMPLETED',
          identityVersion: command.readiness.identityVersion,
          aggregateVersion: 1,
          evaluatedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });
      if (saga.sagaType === 'FIRST_SUPER_ADMIN_BOOTSTRAP') {
        const closed = await transaction.bootstrapControlRecord.updateMany({
          where: {
            environment: saga.environment,
            operationId: saga.operationId,
            lifecycleState: 'RESERVED',
            permanentlyClosed: false,
          },
          data: {
            lifecycleState: 'CONSUMED',
            permanentlyClosed: true,
            completedAt: now,
            aggregateVersion: { increment: 1 },
            updatedAt: now,
          },
        });
        if (closed.count !== 1) throw new TrustedBoundaryError('BOOTSTRAP_CLOSURE_FAILED');
      }
      const completed = await transaction.privilegedActivationSaga.updateMany({
        where: {
          sagaId: saga.sagaId,
          aggregateVersion: command.expectedSagaVersion,
          sagaState: 'AWAITING_IDENTITY_ACTIVATION',
        },
        data: {
          sagaState: 'COMPLETED',
          roleAssignmentId: assignmentId,
          readinessReference: command.readiness.verificationReference,
          eligibilityReference: command.auditReference,
          completedSteps: [
            'AUTHORITY_VERIFIED',
            'IDENTITY_PREPARED',
            'IDENTITY_READY',
            'ROLE_ASSIGNED',
            'ELIGIBILITY_GRANTED',
          ],
          aggregateVersion: { increment: 1 },
          updatedAt: now,
        },
      });
      if (completed.count !== 1) throw new TrustedBoundaryError('STALE_SAGA_VERSION');
      return assignmentId;
    });
  }

  public async invalidateEligibility(identityId: string, reasonCode: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.privilegedAccessEligibilityRecord.updateMany({
      where: { identityId, eligibilityState: 'ELIGIBLE' },
      data: {
        eligibilityState: 'NOT_ELIGIBLE',
        reasonCode,
        invalidatedAt: now,
        aggregateVersion: { increment: 1 },
        updatedAt: now,
      },
    });
  }

  public async cancel(sagaId: string, expectedVersion: number, reasonCode: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (transaction) => {
      const saga = await transaction.privilegedActivationSaga.findUnique({ where: { sagaId } });
      if (saga?.aggregateVersion !== expectedVersion) {
        throw new TrustedBoundaryError('STALE_SAGA_VERSION');
      }
      if (['COMPLETED', 'EXPIRED', 'CANCELLED'].includes(saga.sagaState)) {
        throw new TrustedBoundaryError('SAGA_TERMINAL');
      }
      const updated = await transaction.privilegedActivationSaga.updateMany({
        where: { sagaId, aggregateVersion: expectedVersion, sagaState: saga.sagaState },
        data: {
          sagaState: 'CANCELLED',
          failureReason: reasonCode,
          aggregateVersion: { increment: 1 },
          updatedAt: now,
        },
      });
      if (updated.count !== 1) throw new TrustedBoundaryError('STALE_SAGA_VERSION');
      await transaction.privilegedAccessEligibilityRecord.updateMany({
        where: { sagaId, eligibilityState: 'ELIGIBLE' },
        data: {
          eligibilityState: 'NOT_ELIGIBLE',
          reasonCode: 'SAGA_CANCELLED',
          invalidatedAt: now,
          aggregateVersion: { increment: 1 },
          updatedAt: now,
        },
      });
      await transaction.provisioningAuthorityRecord.updateMany({
        where: { operationId: saga.operationId, lifecycleState: { in: ['ISSUED', 'RESERVED'] } },
        data: { lifecycleState: 'INVALIDATED', aggregateVersion: { increment: 1 }, updatedAt: now },
      });
    });
  }

  public async expireDue(limit = 100): Promise<number> {
    const now = this.clock.now();
    const sagas = await this.prisma.privilegedActivationSaga.findMany({
      where: {
        expiresAt: { lte: now },
        sagaState: { notIn: ['COMPLETED', 'EXPIRED', 'CANCELLED'] },
      },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    let expired = 0;
    for (const saga of sagas) {
      const result = await this.prisma.privilegedActivationSaga.updateMany({
        where: {
          sagaId: saga.sagaId,
          aggregateVersion: saga.aggregateVersion,
          sagaState: saga.sagaState,
        },
        data: {
          sagaState: 'EXPIRED',
          failureReason: 'ACTIVATION_EXPIRED',
          aggregateVersion: { increment: 1 },
          updatedAt: now,
        },
      });
      if (result.count === 1) {
        expired += 1;
        await this.invalidateEligibility(saga.targetIdentityId, 'SAGA_EXPIRED');
      }
    }
    return expired;
  }

  public async markReconciliationRequired(
    sagaId: string,
    expectedVersion: number,
    reasonCode: string,
  ): Promise<void> {
    const updated = await this.prisma.privilegedActivationSaga.updateMany({
      where: {
        sagaId,
        aggregateVersion: expectedVersion,
        sagaState: { notIn: ['COMPLETED', 'EXPIRED', 'CANCELLED'] },
      },
      data: {
        sagaState: 'FAILED_RECONCILIATION',
        reconciliationReason: reasonCode,
        aggregateVersion: { increment: 1 },
        updatedAt: this.clock.now(),
      },
    });
    if (updated.count !== 1) throw new TrustedBoundaryError('STALE_SAGA_VERSION');
  }

  public async resumeReconciliation(
    sagaId: string,
    expectedVersion: number,
    reasonCode: string,
  ): Promise<void> {
    if (reasonCode.trim().length === 0)
      throw new TrustedBoundaryError('RECONCILIATION_REASON_REQUIRED');
    const saga = await this.prisma.privilegedActivationSaga.findUnique({ where: { sagaId } });
    if (
      saga?.sagaState !== 'FAILED_RECONCILIATION' ||
      saga.aggregateVersion !== expectedVersion ||
      saga.expiresAt <= this.clock.now()
    ) {
      throw new TrustedBoundaryError('RECONCILIATION_UNAVAILABLE');
    }
    const resumeState = saga.completedSteps.includes('ROLE_ASSIGNED')
      ? 'ELIGIBILITY_PENDING'
      : 'AWAITING_IDENTITY_ACTIVATION';
    const updated = await this.prisma.privilegedActivationSaga.updateMany({
      where: { sagaId, aggregateVersion: expectedVersion, sagaState: 'FAILED_RECONCILIATION' },
      data: {
        sagaState: resumeState,
        reconciliationReason: reasonCode,
        aggregateVersion: { increment: 1 },
        updatedAt: this.clock.now(),
      },
    });
    if (updated.count !== 1) throw new TrustedBoundaryError('STALE_SAGA_VERSION');
  }

  public async isEligible(
    identityId: string,
    roleName: RoleName,
    environment: string,
  ): Promise<boolean> {
    const record = await this.prisma.privilegedAccessEligibilityRecord.findFirst({
      where: { environment, identityId, roleName },
      orderBy: { evaluatedAt: 'desc' },
    });
    return record?.eligibilityState === 'ELIGIBLE' && record.invalidatedAt === null;
  }
}
