import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IdentityLifecycleError } from '../application/errors/identity-lifecycle.error';
import type { IdentityLifecycleApplicationService } from '../application/services/identity-lifecycle-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import type { AuthenticatedRequest } from './authentication-context';
import { IDENTITY_LIFECYCLE_APPLICATION_SERVICE } from './authentication.tokens';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { noStore, success } from './http-contract';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

@ApiTags('Module 01 Identity Lifecycle')
@Controller('identity')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class IdentityLifecycleController {
  public constructor(
    @Inject(IDENTITY_LIFECYCLE_APPLICATION_SERVICE)
    private readonly lifecycle: IdentityLifecycleApplicationService,
  ) {}

  /**
   * M01-ID-001. Reads the authenticated identity's authentication state. The
   * subject comes from the server-validated ordinary session, so only the
   * caller's own state is ever returned. The response carries approved
   * lifecycle fields only — no profile, role or permission data.
   */
  @Get('authentication-state')
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-ID-001', summary: 'Read authentication state' })
  public async readAuthenticationState(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    try {
      const result = await this.lifecycle.readAuthenticationState({
        identityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      return success({ state: result });
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof IdentityLifecycleError) {
      if (error.code === 'RESOURCE_NOT_AVAILABLE') {
        throw new NotFoundException(error.code);
      }
      throw error;
    }
    throw error;
  }
}
