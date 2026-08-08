import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IdentityError } from '../application/errors/identity.error';
import { noStore, success } from './http-contract';
import type {
  IdentityManagementApplicationService,
  IdentityProfileResult,
} from '../application/services/identity-management-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import type { AuthenticatedRequest } from './authentication-context';
import { IDENTITY_MANAGEMENT_APPLICATION_SERVICE } from './authentication.tokens';
import {
  DeactivateIdentityRequestDto,
  RegisterIdentityRequestDto,
  UpdateIdentityProfileRequestDto,
} from './dto/identity.dto';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

@ApiTags('Module 01 Identity Management')
@Controller('identities')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class IdentityController {
  public constructor(
    @Inject(IDENTITY_MANAGEMENT_APPLICATION_SERVICE)
    private readonly identityService: IdentityManagementApplicationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 10, windowSeconds: 900 })
  @ApiOperation({ operationId: 'M01-ID-001', summary: 'Register a new identity' })
  public async register(
    @Body() body: RegisterIdentityRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    try {
      const result = await this.identityService.register({
        identifierType: body.identifierType,
        identifier: body.identifier,
        password: body.password,
        ...(body.classification === undefined ? {} : { classification: body.classification }),
      });
      noStore(response);
      return success(this.toResponseProfile(result));
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('me')
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-ID-002', summary: 'Retrieve current authenticated profile' })
  public async getMyProfile(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    try {
      const identityId = new UuidV7(request.authentication.subject);
      noStore(response);
      return success(this.toResponseProfile(await this.identityService.getProfile(identityId)));
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get(':id')
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({
    operationId: 'M01-ID-002',
    summary: 'Retrieve current identity profile by ID (self-service only)',
  })
  public async getProfileById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    let identityId: UuidV7;
    try {
      identityId = new UuidV7(id);
    } catch {
      throw new NotFoundException('IDENTITY_NOT_FOUND');
    }
    // Self-service identity management: a caller may only retrieve their own
    // profile. Any other identity id is concealed with 404 (no existence leak).
    if (identityId.value !== request.authentication.subject) {
      throw new NotFoundException('IDENTITY_NOT_FOUND');
    }
    try {
      noStore(response);
      return success(this.toResponseProfile(await this.identityService.getProfile(identityId)));
    } catch (error) {
      this.handleError(error);
    }
  }

  @Patch('me')
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-ID-003', summary: 'Update current identity profile' })
  public async updateMyProfile(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateIdentityProfileRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    // Module 01 defines no mutable profile fields yet; the DTO rejects unknown
    // fields and the application performs a version-safe resource update.
    void body;
    try {
      const identityId = new UuidV7(request.authentication.subject);
      noStore(response);
      return success(this.toResponseProfile(await this.identityService.updateProfile(identityId)));
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('me/deactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-ID-004', summary: 'Deactivate current identity' })
  public async deactivateMyIdentity(
    @Req() request: AuthenticatedRequest,
    @Body() body: DeactivateIdentityRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    try {
      const identityId = new UuidV7(request.authentication.subject);
      noStore(response);
      return success(
        this.toResponseProfile(
          await this.identityService.deactivate(identityId, {
            reasonCode: body.reasonCode,
            authorizingSessionId: new UuidV7(request.authentication.sessionId),
            expectedAuthorizingSessionVersion: request.authentication.sessionVersion,
          }),
        ),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @Delete('me')
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({
    operationId: 'M01-ID-005',
    summary: 'Soft-delete / tombstone staging for identity',
  })
  public async softDeleteMyIdentity(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    try {
      const identityId = new UuidV7(request.authentication.subject);
      noStore(response);
      return success(
        this.toResponseProfile(
          await this.identityService.softDelete(identityId, {
            authorizingSessionId: new UuidV7(request.authentication.sessionId),
            expectedAuthorizingSessionVersion: request.authentication.sessionVersion,
          }),
        ),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private toResponseProfile(profile: IdentityProfileResult): Readonly<Record<string, unknown>> {
    return {
      identityId: profile.identityId,
      identityState: profile.identityState,
      verificationState: profile.verificationState,
      aggregateVersion: profile.aggregateVersion,
      classification: profile.classification,
      ...(profile.primaryIdentifier === undefined
        ? {}
        : { primaryIdentifier: profile.primaryIdentifier }),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      ...(profile.disabledAt === undefined ? {} : { disabledAt: profile.disabledAt.toISOString() }),
      ...(profile.anonymizedAt === undefined
        ? {}
        : { anonymizedAt: profile.anonymizedAt.toISOString() }),
      ...(profile.deletionRequestedAt === undefined
        ? {}
        : { deletionRequestedAt: profile.deletionRequestedAt.toISOString() }),
    };
  }

  private handleError(error: unknown): never {
    if (error instanceof IdentityError) {
      switch (error.code) {
        case 'IDENTITY_NOT_FOUND':
          throw new NotFoundException('IDENTITY_NOT_FOUND');
        case 'IDENTIFIER_ALREADY_REGISTERED':
          throw new ConflictException('IDENTIFIER_ALREADY_REGISTERED');
        case 'IDENTIFIER_INVALID':
          throw new BadRequestException('IDENTIFIER_INVALID');
        case 'CLASSIFICATION_NOT_PERMITTED':
          throw new ForbiddenException('CLASSIFICATION_NOT_PERMITTED');
        case 'IDENTITY_ALREADY_DEACTIVATED':
          throw new ConflictException('IDENTITY_ALREADY_DEACTIVATED');
        case 'IDENTITY_ALREADY_PENDING_DELETION':
          throw new ConflictException('IDENTITY_ALREADY_PENDING_DELETION');
        default:
          throw new BadRequestException(error.code);
      }
    }
    throw error;
  }
}
