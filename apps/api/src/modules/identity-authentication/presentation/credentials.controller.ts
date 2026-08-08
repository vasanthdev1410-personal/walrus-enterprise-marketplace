import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CredentialError } from '../application/errors/credential.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { IdentityManagementApplicationService } from '../application/services/identity-management-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import type { AuthenticatedRequest } from './authentication-context';
import { IDENTITY_MANAGEMENT_APPLICATION_SERVICE } from './authentication.tokens';
import { ChangePasswordRequestDto } from './dto/credential.dto';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { assertIdempotencyKey, etagVersion, noStore } from './http-contract';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

@ApiTags('Module 01 Credentials')
@Controller('credentials')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class CredentialsController {
  public constructor(
    @Inject(IDENTITY_MANAGEMENT_APPLICATION_SERVICE)
    private readonly identityManagement: IdentityManagementApplicationService,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  @Post('password-change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 5, windowSeconds: 300 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({
    operationId: 'M01-CRED-001',
    summary: 'Change the current password (re-authentication required)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async changePassword(
    @Body() body: ChangePasswordRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const claims = request.authentication;
    const expectedIdentityVersion = etagVersion(ifMatch, `identity:${claims.subject}`);
    try {
      await this.idempotency.execute({
        scope: `identity:${claims.subject}`,
        operationType: 'M01-CRED-001',
        idempotencyKey,
        // Neither the current nor the new password is ever stored in the
        // idempotency record; the fingerprint only carries the version.
        request: { expectedIdentityVersion },
        execute: async () => {
          await this.identityManagement.changePassword(new UuidV7(claims.subject), {
            currentPassword: body.currentPassword,
            newPassword: body.newPassword,
            expectedIdentityVersion,
            authorizingSessionId: new UuidV7(claims.sessionId),
            expectedAuthorizingSessionVersion: claims.sessionVersion,
          });
          return { committed: true };
        },
      });
      noStore(response);
      response.status(HttpStatus.NO_CONTENT).send();
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof CredentialError) {
      switch (error.code) {
        case 'CURRENT_CREDENTIAL_INVALID':
        case 'PASSWORD_POLICY_FAILED':
          throw new BadRequestException(error.code);
        case 'RESOURCE_STATE_CONFLICT':
          throw new ConflictException(error.code);
        default:
          throw new BadRequestException(error.code);
      }
    }
    throw error;
  }
}
