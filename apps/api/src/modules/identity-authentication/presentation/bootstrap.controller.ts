import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  PreconditionFailedException,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ProvisioningError } from '../application/errors/provisioning.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { PrivilegedProvisioningApplicationService } from '../application/services/privileged-provisioning-application.service';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import { PRIVILEGED_PROVISIONING_APPLICATION_SERVICE } from './authentication.tokens';
import { BootstrapSuperAdminIdentityRequestDto } from './dto/provisioning.dto';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { assertIdempotencyKey, noStore, success } from './http-contract';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

/**
 * M01-ADM-002. Controlled bootstrap of the initial universal Identity
 * associated with Super Admin access. The route is BOOTSTRAP_CONTROLLED: there
 * is no caller Session — availability is decided by the narrow
 * BootstrapAuthorizationPort at decision time (BOOTSTRAP_UNAVAILABLE until an
 * approved controlled bootstrap contract is integrated). The
 * SUPER_ADMIN_AUTHENTICATION classification is always applied server-side;
 * Module 01 bootstrap never grants Super Admin authorization (Module 02 owns
 * the role) and no Module 02 role is ever returned.
 */
@ApiTags('Module 01 Bootstrap')
@Controller('bootstrap')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class BootstrapController {
  public constructor(
    @Inject(PRIVILEGED_PROVISIONING_APPLICATION_SERVICE)
    private readonly provisioning: PrivilegedProvisioningApplicationService,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  @Post('super-admin-identity')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 3, windowSeconds: 900 })
  @ApiOperation({ operationId: 'M01-ADM-002', summary: 'Bootstrap super-admin identity' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async bootstrapSuperAdminIdentity(
    @Body() body: BootstrapSuperAdminIdentityRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.idempotency.execute({
        scope: 'bootstrap:super-admin-identity',
        operationType: 'M01-ADM-002',
        idempotencyKey,
        request: {
          bootstrapEvidence: body.bootstrapEvidence,
          identifierType: body.identifierType,
          identifier: body.identifier,
        },
        execute: () =>
          this.provisioning.bootstrapSuperAdminIdentity({
            bootstrapEvidence: body.bootstrapEvidence,
            identifierType: body.identifierType,
            identifier: body.identifier,
          }),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(
        success({
          identityId: result.identityId,
          bootstrapState: result.bootstrapState,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof ProvisioningError) {
      switch (error.code) {
        case 'BOOTSTRAP_UNAVAILABLE':
          throw new NotFoundException(error.code);
        case 'IDENTIFIER_INVALID':
          throw new BadRequestException(error.code);
        case 'IDENTIFIER_ALREADY_REGISTERED':
          throw new ConflictException(error.code);
        case 'RESOURCE_STATE_CONFLICT':
          throw new PreconditionFailedException(error.code);
        default:
          throw new BadRequestException(error.code);
      }
    }
    throw error;
  }
}
