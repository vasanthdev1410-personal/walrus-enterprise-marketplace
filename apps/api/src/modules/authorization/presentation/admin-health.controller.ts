import { Controller, Get, HttpStatus, Inject, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Aal2SessionGuard } from '../../identity-authentication/presentation/guards/aal2-session.guard';
import type { AuthenticatedRequest } from '../../identity-authentication/presentation/authentication-context';
import { noStore, success } from '../../identity-authentication/presentation/http-contract';
import type { AuthorizationApplicationService } from '../application/services/authorization-application.service';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../authorization.tokens';
import {
  AuthorizationPermissionGuard,
  RequiresPermission,
} from './guards/authorization-permission.guard';

/**
 * Admin-only infrastructure verification endpoint. Requires an ordinary AAL2
 * session (401 otherwise) AND the `authorization.permission.view` grant, which
 * the approved Module 02 role catalog grants to ADMIN and SUPER_ADMIN only —
 * a CUSTOMER/SELLER caller is denied with 403 (AUTHORIZATION_DENIED). The role
 * reported is resolved from the caller's own active role assignments, never
 * from client input (Part 6.5 §24 — no internal policy is exposed).
 */
@ApiTags('admin')
@Controller('admin')
@UseGuards(Aal2SessionGuard)
export class AdminHealthController {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  @Get('health')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('authorization.permission.view')
  @ApiOperation({
    operationId: 'M02-ADMIN-HEALTH',
    summary: 'Verify admin authorization infrastructure (authenticated + ADMIN role)',
  })
  public async health(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const assignments = await this.authorization.listIdentityRoleAssignments(
      new UuidV7(request.authentication.subject),
    );
    const adminRole = assignments.find(
      (assignment) =>
        assignment.properties.assignmentState === 'ACTIVE' &&
        (assignment.properties.roleName === 'ADMIN' ||
          assignment.properties.roleName === 'SUPER_ADMIN'),
    );
    noStore(response);
    response
      .status(HttpStatus.OK)
      .json(success({ status: 'ok', role: adminRole?.properties.roleName ?? 'ADMIN' }));
  }
}
