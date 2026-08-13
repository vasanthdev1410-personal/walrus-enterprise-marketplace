import { Inject, Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import {
  AUTHORIZATION_APPLICATION_SERVICE,
  IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
} from '../../../authorization/authorization.tokens';
import type { IdentityRoleAssignmentRepository } from '../../../authorization/domain/repositories/identity-role-assignment-repository';
import type {
  Module02AuthorizationContractPort,
  SellerRoleAssignmentRequest,
  SellerRoleAssignmentResult,
  SellerRoleRevocationRequest,
} from '../../domain/ports/module-02-contract.port';

/**
 * WEMP-M03-CONTRACT-001 §B / decision D-11. The Module 02 ↔ Module 03 SELLER
 * authorization adapter. Module 03 never evaluates roles itself and never
 * reads Module 02 storage: every request is forwarded to the approved Module
 * 02 application service, which enforces the approved lifecycle gate (seller
 * previously approved), idempotency, concurrency and audit. Any Module 02
 * error maps to FAILED (fail closed) — never to a silent grant.
 */
@Injectable()
export class Module02SellerRoleAssignmentAdapter implements Module02AuthorizationContractPort {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
    @Inject(IDENTITY_ROLE_ASSIGNMENT_REPOSITORY)
    private readonly assignments: IdentityRoleAssignmentRepository,
  ) {}

  public async isSellerRoleGranted(identityId: UuidV7): Promise<boolean> {
    const active = await this.assignments.findActiveByIdentityId(identityId);
    return active.some((assignment) => assignment.properties.roleName === 'SELLER');
  }

  public async requestSellerRoleAssignment(
    request: SellerRoleAssignmentRequest,
  ): Promise<SellerRoleAssignmentResult> {
    try {
      return await this.authorization.assignSellerRoleForActivation({
        targetIdentityId: request.targetIdentityId,
        sellerProfileId: request.sellerProfileId,
        authorityEvidenceReference: `seller:${request.sellerProfileId.value}`,
        ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
      });
    } catch {
      return { outcome: 'FAILED', reason: 'ASSIGNMENT_FAILED' };
    }
  }

  public async revokeSellerRole(
    request: SellerRoleRevocationRequest,
  ): Promise<SellerRoleAssignmentResult> {
    try {
      return await this.authorization.revokeSellerRole({
        identityId: request.identityId,
        ...(request.revokedByIdentityId === undefined
          ? {}
          : { revokedByIdentityId: request.revokedByIdentityId }),
        ...(request.reasonReference === undefined ? {} : { reasonReference: request.reasonReference }),
        ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
      });
    } catch {
      return { outcome: 'FAILED', reason: 'REVOCATION_FAILED' };
    }
  }
}
