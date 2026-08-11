import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Aal2SessionGuard } from '../../identity-authentication/presentation/guards/aal2-session.guard';
import type { AuthenticatedRequest } from '../../identity-authentication/presentation/authentication-context';
import { noStore, success } from '../../identity-authentication/presentation/http-contract';
import type { AuthorizationApplicationService } from '../application/services/authorization-application.service';
import { AuthorizationError } from '../application/errors/authorization.error';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../authorization.tokens';
import type { IdentityRoleAssignment } from '../domain/entities/identity-role-assignment';
import type { Role } from '../domain/entities/role';
import { AssignRoleRequestDto } from './dto/authorization.dto';
import {
  AuthorizationPermissionGuard,
  RequiresPermission,
} from './guards/authorization-permission.guard';

/**
 * Part 6.2/6.3/6.5 (Module 02 source material). Authorization administration
 * API. Every route requires an ordinary AAL2 session; privileged routes further
 * require the exact declared permission and are enforced by the authorization
 * guard before business logic executes. Responses expose no internal policy
 * configuration (Part 6.5 §24).
 */
@ApiTags('authorization')
@Controller('authorization')
@UseGuards(Aal2SessionGuard)
export class AuthorizationController {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  @Get('roles')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('authorization.permission.view')
  @ApiOperation({
    operationId: 'M02-ROLE-CATALOG',
    summary: 'List the approved Phase-1 role catalog',
  })
  public listRoleCatalog(@Res() response: Response): void {
    const roles = this.authorization.listRoleCatalog();
    noStore(response);
    response.status(HttpStatus.OK).json(success({ roles: roles.map(toPublicRole) }));
  }

  @Get('me')
  @ApiOperation({ operationId: 'M02-ROLE-ASSIGNMENTS-ME', summary: 'List own role assignments' })
  public async listOwnRoleAssignments(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const assignments = await this.authorization.listIdentityRoleAssignments(
      new UuidV7(request.authentication.subject),
    );
    noStore(response);
    response
      .status(HttpStatus.OK)
      .json(success({ roleAssignments: assignments.map(toPublicAssignment) }));
  }

  @Post('role-assignments')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('authorization.role.assign')
  @ApiOperation({
    operationId: 'M02-ROLE-ASSIGN',
    summary: 'Assign an approved role to an identity (server-controlled)',
  })
  public async assignRole(
    @Body() body: AssignRoleRequestDto,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const assignment = await this.authorization.assignRole({
        targetIdentityId: new UuidV7(body.targetIdentityId),
        roleName: body.roleName,
        assignedByIdentityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      response
        .status(HttpStatus.CREATED)
        .json(success({ roleAssignment: toPublicAssignment(assignment) }));
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('role-assignments/:assignmentId/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('authorization.role.revoke')
  @ApiOperation({
    operationId: 'M02-ROLE-REVOKE',
    summary: 'Revoke an identity role assignment (version-checked)',
  })
  public async revokeRole(
    @Param('assignmentId') assignmentId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const assignment = await this.authorization.revokeRole({
        assignmentId: parseAssignmentId(assignmentId),
        revokedByIdentityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      response
        .status(HttpStatus.OK)
        .json(success({ roleAssignment: toPublicAssignment(assignment) }));
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof AuthorizationError) {
      switch (error.code) {
        case 'AUTHORIZATION_DENIED':
        case 'TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE':
          throw new ForbiddenException(error.code);
        case 'ASSIGNMENT_NOT_FOUND':
          throw new NotFoundException(error.code);
        case 'ROLE_RETIRED':
        case 'ROLE_NOT_ACTIVE':
        case 'ALREADY_ASSIGNED':
        case 'ALREADY_REVOKED':
        case 'STALE_VERSION':
          throw new ConflictException(error.code);
        case 'ROLE_UNKNOWN':
        default:
          throw new BadRequestException(error.code);
      }
    }
    throw error;
  }
}

function parseAssignmentId(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new BadRequestException('ASSIGNMENT_NOT_FOUND');
  }
}

function toPublicAssignment(assignment: IdentityRoleAssignment): Readonly<Record<string, unknown>> {
  return {
    assignmentId: assignment.properties.assignmentId.value,
    roleName: assignment.properties.roleName,
    assignmentState: assignment.properties.assignmentState,
    assignedAt: assignment.properties.assignedAt,
    revokedAt: assignment.properties.revokedAt,
  };
}

function toPublicRole(role: Role): Readonly<Record<string, unknown>> {
  // Role configuration (the permission matrix) is internal policy (Part 6.5
  // §24) and is never exposed; only the approved role name and lifecycle state.
  return {
    roleName: role.properties.roleName,
    state: role.properties.state,
  };
}
