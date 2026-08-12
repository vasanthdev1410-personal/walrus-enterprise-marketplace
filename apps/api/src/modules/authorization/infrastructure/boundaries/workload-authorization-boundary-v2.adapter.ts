import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BootstrapAuthorizationPort } from '../../../identity-authentication/application/ports/bootstrap-authorization.port';
import type { ClassificationTransitionCoordinationPort } from '../../../identity-authentication/application/ports/classification-transition-coordination.port';
import type { PrivilegedProvisioningAuthorizationPort } from '../../../identity-authentication/application/ports/privileged-provisioning-authorization.port';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { PrivilegedActivationService } from '../../application/services/privileged-activation.service';

@Injectable()
export class WorkloadAuthorizationBoundaryV2Adapter
  implements
    ClassificationTransitionCoordinationPort,
    PrivilegedProvisioningAuthorizationPort,
    BootstrapAuthorizationPort
{
  public constructor(
    private readonly prisma: PrismaService,
    private readonly activation: PrivilegedActivationService,
  ) {}

  public async validateContract(
    command: Parameters<ClassificationTransitionCoordinationPort['validateContract']>[0],
  ): Promise<{ readonly contractValid: boolean; readonly contractReference?: string }> {
    if (!command.workload) return { contractValid: false };
    const authority = await this.prisma.provisioningAuthorityRecord.findFirst({
      where: {
        lookupReferenceDigest: digest(command.sourceContractReference),
        environment: command.workload.environment,
        operationId: command.workload.operationId,
        targetIdentityId: command.targetIdentityId.value,
        requestedClassification: command.targetAuthenticationSecurityClassification,
        lifecycleState: { in: ['RESERVED', 'CONSUMED'] },
        expiresAt: { gt: new Date() },
      },
    });
    return authority
      ? { contractValid: true, contractReference: command.workload.verificationReference }
      : { contractValid: false };
  }

  public async authorizeProvisioning(
    command: Parameters<PrivilegedProvisioningAuthorizationPort['authorizeProvisioning']>[0],
  ): Promise<{
    readonly authorized: boolean;
    readonly authorizationReference?: string;
    readonly intendedIdentityId?: UuidV7;
    readonly operationId?: string;
    readonly authorityExpiresAt?: Date;
  }> {
    if (!command.workload || !command.provisioningAssertionDigest) return { authorized: false };
    const authority = await this.prisma.provisioningAuthorityRecord.findFirst({
      where: {
        lookupReferenceDigest: digest(command.provisioningReference),
        evidenceDigest: command.provisioningAssertionDigest,
        environment: command.workload.environment,
        operationId: command.workload.operationId,
        requestedRole: 'ADMIN',
        requestedClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        lifecycleState: 'ISSUED',
        expiresAt: { gt: new Date() },
      },
    });
    if (!authority) return { authorized: false };
    const reserved = await this.prisma.provisioningAuthorityRecord.updateMany({
      where: {
        provisioningRecordId: authority.provisioningRecordId,
        aggregateVersion: authority.aggregateVersion,
        lifecycleState: 'ISSUED',
      },
      data: {
        lifecycleState: 'RESERVED',
        reservedByOperationId: authority.operationId,
        aggregateVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    if (reserved.count !== 1) return { authorized: false };
    return {
      authorized: true,
      authorizationReference: command.workload.verificationReference,
      intendedIdentityId: new UuidV7(authority.targetIdentityId),
      operationId: authority.operationId,
      authorityExpiresAt: authority.expiresAt,
    };
  }

  public async completeProvisioning(command: {
    readonly operationId: string;
    readonly identityId: UuidV7;
    readonly authorizationReference: string;
  }): Promise<void> {
    const authority = await this.prisma.provisioningAuthorityRecord.findUnique({
      where: { operationId: command.operationId },
    });
    if (
      authority?.lifecycleState !== 'RESERVED' ||
      authority.targetIdentityId !== command.identityId.value
    )
      throw new Error('AUTHORIZATION_DENIED');
    await this.activation.begin({
      operationId: authority.operationId,
      requestId: authority.provisioningRecordId,
      sagaType:
        authority.requestedRole === 'ADMIN' ? 'ADMIN_PROVISIONING' : 'SUPER_ADMIN_PROVISIONING',
      targetIdentityId: authority.targetIdentityId,
      requestedRole: authority.requestedRole as 'ADMIN' | 'SUPER_ADMIN',
      requestedClassification: authority.requestedClassification as
        'PRIVILEGED_ADMIN_AUTHENTICATION' | 'SUPER_ADMIN_AUTHENTICATION',
      environment: authority.environment,
      authorityReference: command.authorizationReference,
      expiresAt: authority.expiresAt,
    });
    const consumed = await this.prisma.provisioningAuthorityRecord.updateMany({
      where: {
        provisioningRecordId: authority.provisioningRecordId,
        lifecycleState: 'RESERVED',
        aggregateVersion: authority.aggregateVersion,
      },
      data: {
        lifecycleState: 'CONSUMED',
        consumedAt: new Date(),
        aggregateVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    if (consumed.count !== 1) throw new Error('AUTHORIZATION_DENIED');
  }

  public async markProvisioningFailure(command: {
    readonly operationId: string;
    readonly reasonCode: string;
  }): Promise<void> {
    await this.prisma.provisioningAuthorityRecord.updateMany({
      where: { operationId: command.operationId, lifecycleState: { in: ['ISSUED', 'RESERVED'] } },
      data: {
        lifecycleState: 'RECONCILIATION_REQUIRED',
        aggregateVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  public async authorizeBootstrap(
    command: Parameters<BootstrapAuthorizationPort['authorizeBootstrap']>[0],
  ): Promise<{
    readonly available: boolean;
    readonly intendedIdentityId?: UuidV7;
    readonly operationId?: string;
    readonly authorizationReference?: string;
    readonly authorityExpiresAt?: Date;
  }> {
    if (!command.workload || !command.bootstrapAssertionDigest) return { available: false };
    const bootstrap = await this.prisma.bootstrapControlRecord.findUnique({
      where: { environment: command.workload.environment },
    });
    if (
      !bootstrap ||
      bootstrap.permanentlyClosed ||
      bootstrap.lifecycleState !== 'RESERVED' ||
      bootstrap.operationId !== command.workload.operationId ||
      bootstrap.evidenceDigest !== command.bootstrapAssertionDigest ||
      bootstrap.expiresAt <= new Date()
    )
      return { available: false };
    return {
      available: true,
      intendedIdentityId: new UuidV7(bootstrap.intendedIdentityId),
      operationId: bootstrap.operationId,
      authorizationReference: command.workload.verificationReference,
      authorityExpiresAt: bootstrap.expiresAt,
    };
  }

  public async completeBootstrapPreparation(command: {
    readonly operationId: string;
    readonly identityId: UuidV7;
    readonly authorizationReference: string;
  }): Promise<void> {
    const bootstrap = await this.prisma.bootstrapControlRecord.findUnique({
      where: { operationId: command.operationId },
    });
    if (
      !bootstrap ||
      bootstrap.permanentlyClosed ||
      bootstrap.lifecycleState !== 'RESERVED' ||
      bootstrap.intendedIdentityId !== command.identityId.value
    )
      throw new Error('BOOTSTRAP_UNAVAILABLE');
    await this.activation.begin({
      operationId: bootstrap.operationId,
      requestId: bootstrap.bootstrapRecordId,
      sagaType: 'FIRST_SUPER_ADMIN_BOOTSTRAP',
      targetIdentityId: bootstrap.intendedIdentityId,
      requestedRole: 'SUPER_ADMIN',
      requestedClassification: 'SUPER_ADMIN_AUTHENTICATION',
      environment: bootstrap.environment,
      authorityReference: command.authorizationReference,
      expiresAt: bootstrap.expiresAt,
    });
  }

  public async markBootstrapFailure(command: {
    readonly operationId: string;
    readonly reasonCode: string;
  }): Promise<void> {
    await this.prisma.bootstrapControlRecord.updateMany({
      where: { operationId: command.operationId, permanentlyClosed: false },
      data: {
        lifecycleState: 'RECONCILIATION_REQUIRED',
        aggregateVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}
