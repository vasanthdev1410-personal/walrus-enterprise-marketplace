import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
import type { Request, Response } from 'express';
import { CredentialError } from '../application/errors/credential.error';
import { PasswordResetError } from '../application/errors/password-reset.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { IdentityManagementApplicationService } from '../application/services/identity-management-application.service';
import type { PasswordResetApplicationService } from '../application/services/password-reset-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import type { AuthenticatedRequest } from './authentication-context';
import {
  IDENTITY_MANAGEMENT_APPLICATION_SERVICE,
  PASSWORD_RESET_APPLICATION_SERVICE,
} from './authentication.tokens';
import { ChangePasswordRequestDto } from './dto/credential.dto';
import {
  PasswordResetConfirmationDto,
  PasswordResetRequestDto,
} from './dto/password-reset.dto';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import {
  anonymousScope,
  assertIdempotencyKey,
  etagVersion,
  noStore,
  success,
} from './http-contract';
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
    @Inject(PASSWORD_RESET_APPLICATION_SERVICE)
    private readonly passwordReset: PasswordResetApplicationService,
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

  @Post('password-reset-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 5, windowSeconds: 900 })
  @ApiOperation({
    operationId: 'M01-CRED-002',
    summary: 'Request a purpose-bound password-reset challenge (forgot password)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async requestPasswordReset(
    @Body() body: PasswordResetRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.idempotency.execute({
        scope: anonymousScope(request),
        operationType: 'M01-CRED-002',
        idempotencyKey,
        request: { identifier: body.identifier, channelType: body.channelType },
        execute: () =>
          this.passwordReset.requestReset({
            identifier: body.identifier,
            channelType: body.channelType,
          }),
      });
      noStore(response);
      // The approved M01-CRED-002 body carries acceptance and the correlation
      // id only. The recovery locator travels in headers that are ALWAYS
      // present (a concealed non-issued locator when no challenge was actually
      // created) so a caller cannot distinguish an existing account by the
      // presence of the header.
      response.setHeader('X-Recovery-Challenge', result.challengeId);
      response.setHeader('X-Recovery-Challenge-Version', result.version.toString());
      response.status(HttpStatus.ACCEPTED).json(success({ accepted: true }));
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('password-reset-confirmations')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 5, windowSeconds: 300 })
  @ApiOperation({
    operationId: 'M01-CRED-003',
    summary: 'Confirm the password-reset OTP and set a new password',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiHeader({ name: 'X-Recovery-Challenge', required: true })
  @ApiHeader({ name: 'X-Recovery-Evidence', required: true })
  public async confirmPasswordReset(
    @Body() body: PasswordResetConfirmationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-recovery-challenge') recoveryChallenge: string | undefined,
    @Headers('x-recovery-evidence') recoveryEvidence: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const challengeIdValue = parseRecoveryChallenge(recoveryChallenge);
    const expectedChallengeVersion = etagVersion(ifMatch, `challenge:${challengeIdValue.value}`);
    try {
      await this.idempotency.execute({
        scope: `challenge:${challengeIdValue.value}`,
        operationType: 'M01-CRED-003',
        idempotencyKey,
        // The one-time evidence and the new password are intentionally excluded
        // from the idempotency record so the stored fingerprint never embeds
        // recoverable credential material or the single-use code.
        request: { challengeId: challengeIdValue.value, ifMatch },
        execute: () =>
          this.passwordReset.confirmReset({
            challengeId: challengeIdValue,
            expectedChallengeVersion,
            verificationEvidence: recoveryEvidence ?? '',
            newPassword: body.newPassword,
          }),
      });
      noStore(response);
      response.status(HttpStatus.NO_CONTENT).send();
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof PasswordResetError) {
      switch (error.code) {
        case 'RECOVERY_OPERATION_NOT_PERMITTED':
          throw new ForbiddenException(error.code);
        case 'RECOVERY_STATE_CONFLICT':
          throw new ConflictException(error.code);
        case 'PASSWORD_POLICY_FAILED':
          throw new BadRequestException(error.code);
        default:
          throw new BadRequestException(error.code);
      }
    }
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

/**
 * Parses the recovery challenge locator header. A missing or malformed locator
 * is indistinguishable from an invalid challenge so the response stays uniform
 * (RECOVERY_OPERATION_NOT_PERMITTED) and account existence is never revealed.
 */
function parseRecoveryChallenge(value: string | undefined): UuidV7 {
  if (value === undefined) throw new ForbiddenException('RECOVERY_OPERATION_NOT_PERMITTED');
  try {
    return new UuidV7(value);
  } catch {
    throw new ForbiddenException('RECOVERY_OPERATION_NOT_PERMITTED');
  }
}
