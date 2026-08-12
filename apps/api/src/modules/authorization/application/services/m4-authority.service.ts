import { createHash, randomBytes } from 'node:crypto';
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
import { TrustedBoundaryError } from '../errors/trusted-boundary.error';

export interface AuthoritySignerPort {
  activeKeyId(): Promise<string>;
  /** Signs with ES256 and places the exact supplied keyId in the protected `kid` header. */
  signProvisioningClaims(claims: Readonly<Record<string, unknown>>, keyId: string): Promise<string>;
}

export interface IssueProvisioningCommand {
  readonly operationId: string;
  readonly targetIdentityId: string;
  readonly requestedRole: 'ADMIN' | 'SUPER_ADMIN';
  readonly requestedClassification:
    'PRIVILEGED_ADMIN_AUTHENTICATION' | 'SUPER_ADMIN_AUTHENTICATION';
  readonly operation: 'PROVISION' | 'REPLACE_PRIVILEGED_ROLE' | 'REPROVISION';
  readonly environment: string;
  readonly policyVersion: 'wemp.m02.m4.v1';
  readonly approvals: readonly {
    readonly authorityType: 'SUPER_ADMIN' | 'SECURITY';
    readonly authorityId: string;
    readonly approverIdentityId?: string;
    readonly sessionId?: string;
    readonly assurance: 'AAL2';
    readonly evidenceReference: string;
    readonly approvedAt: Date;
    readonly expiresAt: Date;
  }[];
}

@Injectable()
export class M4AuthorityService {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(UUID_V7_GENERATOR) private readonly identifiers: UuidV7GenerationPort,
    @Inject('M4_AUTHORITY_SIGNER') private readonly signer: AuthoritySignerPort,
  ) {}

  public async issueProvisioning(command: IssueProvisioningCommand): Promise<{
    readonly lookupReference: string;
    readonly compactAssertion: string;
  }> {
    const now = this.clock.now();
    this.validateProvisioningQuorum(command, now);
    const jwtId = this.identifiers.next().value;
    const expiresAt = new Date(now.getTime() + 300_000);
    const keyId = await this.signer.activeKeyId();
    if (keyId.trim().length === 0) throw new TrustedBoundaryError('AUTHORITY_KEY_UNAVAILABLE');
    const claims = {
      version: 'walrus.provisioning.v1',
      issuer: 'urn:walrus:module-02:provisioning-authority',
      audience: 'urn:walrus:module-01:privileged-provisioning',
      subjectIdentityId: command.targetIdentityId,
      requestedClassification: command.requestedClassification,
      requestedRole: command.requestedRole,
      environment: command.environment,
      operation: command.operation,
      operationId: command.operationId,
      policyVersion: command.policyVersion,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      jwtId,
      approverIdentityIds: command.approvals.flatMap((a) =>
        a.approverIdentityId ? [a.approverIdentityId] : [],
      ),
      keyId,
    };
    const compactAssertion = await this.signer.signProvisioningClaims(claims, keyId);
    const lookupReference = `prvref:${randomBytes(32).toString('base64url')}`;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.provisioningAuthorityRecord.create({
        data: {
          provisioningRecordId: this.identifiers.next().value,
          operationId: command.operationId,
          environment: command.environment,
          targetIdentityId: command.targetIdentityId,
          requestedRole: command.requestedRole,
          requestedClassification: command.requestedClassification,
          operationType: command.operation,
          jwtId,
          evidenceDigest: digest(compactAssertion),
          lookupReferenceDigest: digest(lookupReference),
          policyVersion: command.policyVersion,
          lifecycleState: 'ISSUED',
          issuedAt: now,
          expiresAt,
          aggregateVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
      });
      for (const approval of command.approvals) {
        await transaction.authorizationApprovalRecord.create({
          data: {
            approvalRecordId: this.identifiers.next().value,
            operationId: command.operationId,
            authorityType: approval.authorityType,
            authorityId: approval.authorityId,
            approverIdentityId: approval.approverIdentityId ?? null,
            sessionId: approval.sessionId ?? null,
            assurance: approval.assurance,
            decision: 'APPROVE',
            evidenceDigest: digest(approval.evidenceReference),
            policyVersion: command.policyVersion,
            approvedAt: approval.approvedAt,
            expiresAt: approval.expiresAt,
            createdAt: now,
          },
        });
      }
    });
    return { lookupReference, compactAssertion };
  }

  public async reserveProvisioning(input: {
    readonly lookupReference: string;
    readonly assertion: string;
    readonly operationId: string;
    readonly jwtId: string;
    readonly expectedVersion: number;
  }): Promise<void> {
    const now = this.clock.now();
    const updated = await this.prisma.provisioningAuthorityRecord.updateMany({
      where: {
        operationId: input.operationId,
        jwtId: input.jwtId,
        lookupReferenceDigest: digest(input.lookupReference),
        evidenceDigest: digest(input.assertion),
        lifecycleState: 'ISSUED',
        aggregateVersion: input.expectedVersion,
        expiresAt: { gt: now },
      },
      data: {
        lifecycleState: 'RESERVED',
        reservedByOperationId: input.operationId,
        aggregateVersion: { increment: 1 },
        updatedAt: now,
      },
    });
    if (updated.count !== 1) throw new TrustedBoundaryError('PROVISIONING_EVIDENCE_UNAVAILABLE');
  }

  public async consumeProvisioning(operationId: string, expectedVersion: number): Promise<void> {
    const now = this.clock.now();
    const updated = await this.prisma.provisioningAuthorityRecord.updateMany({
      where: { operationId, lifecycleState: 'RESERVED', aggregateVersion: expectedVersion },
      data: {
        lifecycleState: 'CONSUMED',
        consumedAt: now,
        aggregateVersion: { increment: 1 },
        updatedAt: now,
      },
    });
    if (updated.count !== 1) throw new TrustedBoundaryError('PROVISIONING_EVIDENCE_UNAVAILABLE');
  }

  public async openBootstrap(input: {
    readonly environment: string;
    readonly operationId: string;
    readonly intendedIdentityId: string;
    readonly jwtId: string;
    readonly evidenceDigest: string;
    readonly securityAuthorityId: string;
    readonly operationsAuthorityId: string;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
  }): Promise<void> {
    const now = this.clock.now();
    if (
      input.securityAuthorityId === input.operationsAuthorityId ||
      input.expiresAt <= now ||
      input.expiresAt.getTime() - input.issuedAt.getTime() > 600_000
    ) {
      throw new TrustedBoundaryError('BOOTSTRAP_UNAVAILABLE');
    }
    await this.prisma.bootstrapControlRecord
      .create({
        data: {
          bootstrapRecordId: this.identifiers.next().value,
          environment: input.environment,
          operationId: input.operationId,
          intendedIdentityId: input.intendedIdentityId,
          jwtId: input.jwtId,
          evidenceDigest: input.evidenceDigest,
          securityAuthorityId: input.securityAuthorityId,
          operationsAuthorityId: input.operationsAuthorityId,
          lifecycleState: 'RESERVED',
          permanentlyClosed: false,
          issuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
          aggregateVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
      })
      .catch(() => {
        throw new TrustedBoundaryError('BOOTSTRAP_UNAVAILABLE');
      });
  }

  private validateProvisioningQuorum(command: IssueProvisioningCommand, now: Date): void {
    const valid = command.approvals.filter(
      (approval) => approval.approvedAt <= now && approval.expiresAt > now,
    );
    const superAdmins = new Set(
      valid.filter((a) => a.authorityType === 'SUPER_ADMIN').map((a) => a.authorityId),
    );
    const security = new Set(
      valid.filter((a) => a.authorityType === 'SECURITY').map((a) => a.authorityId),
    );
    const classification =
      command.requestedRole === 'ADMIN'
        ? 'PRIVILEGED_ADMIN_AUTHENTICATION'
        : 'SUPER_ADMIN_AUTHENTICATION';
    if (
      command.requestedClassification !== classification ||
      (command.requestedRole === 'ADMIN'
        ? superAdmins.size < 1
        : superAdmins.size < 2 || security.size < 1) ||
      valid.some((a) => a.approverIdentityId === command.targetIdentityId)
    ) {
      throw new TrustedBoundaryError('PROVISIONING_QUORUM_INVALID');
    }
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}
