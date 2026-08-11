import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MfaError } from '../application/errors/mfa.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { MfaEnrollmentApplicationService } from '../application/services/mfa-enrollment-application.service';
import type { RecoveryCodeSetApplicationService } from '../application/services/recovery-code-set-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import type { AuthenticatedRequest } from './authentication-context';
import {
  MFA_ENROLLMENT_APPLICATION_SERVICE,
  RECOVERY_CODE_SET_APPLICATION_SERVICE,
} from './authentication.tokens';
import { MfaEnrollmentConfirmationRequestDto, MfaEnrollmentRequestDto } from './dto/mfa.dto';
import { Aal2SessionGuard } from './guards/aal2-session.guard';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { assertIdempotencyKey, etagVersion, noStore, success } from './http-contract';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

@ApiTags('Module 01 MFA')
@Controller('mfa')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class MfaController {
  public constructor(
    @Inject(MFA_ENROLLMENT_APPLICATION_SERVICE)
    private readonly mfaEnrollment: MfaEnrollmentApplicationService,
    @Inject(RECOVERY_CODE_SET_APPLICATION_SERVICE)
    private readonly recoveryCodeSets: RecoveryCodeSetApplicationService,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  /**
   * M01-MFA-001. Starts a TOTP enrollment. The identity version (If-Match)
   * guards the aggregate write; the TOTP setup secret is returned exactly once
   * and intentionally excluded from the idempotency record so a credential is
   * never persisted in any form.
   */
  @Post('enrollments')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 3, windowSeconds: 900 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-MFA-001', summary: 'Start TOTP MFA enrollment' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async startEnrollment(
    @Body() body: MfaEnrollmentRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const claims = request.authentication;
    const expectedIdentityVersion = etagVersion(ifMatch, `identity:${claims.subject}`);
    try {
      const result = await this.idempotency.execute({
        scope: `identity:${claims.subject}`,
        operationType: 'M01-MFA-001',
        idempotencyKey,
        // The TOTP setup secret is intentionally excluded from the idempotency
        // record so the stored fingerprint never embeds a credential.
        request: { factorType: body.factorType, ifMatch },
        execute: () =>
          this.mfaEnrollment.startEnrollment({
            identityId: new UuidV7(claims.subject),
            expectedIdentityVersion,
            factorType: body.factorType,
          }),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(
        success({
          enrollmentId: result.enrollmentId,
          enrollmentState: result.enrollmentState,
          protectedSetupMaterial: result.protectedSetupMaterial,
          expiresAt: result.expiresAt.toISOString(),
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-MFA-002. Confirms the enrollment with the TOTP. The enrollment-bound
   * challenge version travels in If-Match; the evidence is intentionally
   * excluded from the idempotency record so the one-time code is never
   * persisted.
   */
  @Post('enrollments/:enrollmentId/confirmations')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 300 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-MFA-002', summary: 'Confirm TOTP enrollment' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async confirmEnrollment(
    @Param('enrollmentId') enrollmentId: string,
    @Body() body: MfaEnrollmentConfirmationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const enrollmentIdValue = parseEnrollmentId(enrollmentId);
    const expectedEnrollmentVersion = etagVersion(ifMatch, `enrollment:${enrollmentIdValue.value}`);
    const claims = request.authentication;
    try {
      const result = await this.idempotency.execute({
        scope: `identity:${claims.subject}`,
        operationType: 'M01-MFA-002',
        idempotencyKey,
        // The TOTP evidence is intentionally excluded from the idempotency
        // record so the one-time code is never persisted in any form.
        request: { enrollmentId, ifMatch },
        execute: () =>
          this.mfaEnrollment.confirmEnrollment({
            identityId: new UuidV7(claims.subject),
            enrollmentId: enrollmentIdValue,
            expectedEnrollmentVersion,
            verificationEvidence: body.verificationEvidence,
          }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          enrollmentId: result.enrollmentId,
          enrollmentState: result.enrollmentState,
          recoveryCodes: result.recoveryCodes,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-MFA-005. Regenerates the recovery-code set at the approved one-time
   * issuance point. Requires an ordinary AAL2 session; the identity version
   * (If-Match) guards the aggregate write. Raw recovery codes are returned
   * exactly once and intentionally excluded from the idempotency record so a
   * credential is never persisted in any form.
   */
  @Post('recovery-code-sets')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 3, windowSeconds: 900 })
  @UseGuards(Aal2SessionGuard)
  @ApiOperation({ operationId: 'M01-MFA-005', summary: 'Regenerate recovery-code set' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async regenerateRecoveryCodes(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const claims = request.authentication;
    const expectedIdentityVersion = etagVersion(ifMatch, `identity:${claims.subject}`);
    try {
      const result = await this.idempotency.execute({
        scope: `identity:${claims.subject}`,
        operationType: 'M01-MFA-005',
        idempotencyKey,
        // Raw recovery codes are intentionally excluded from the idempotency
        // record so the stored fingerprint never embeds a credential.
        request: { ifMatch },
        execute: () =>
          this.recoveryCodeSets.regenerate({
            identityId: new UuidV7(claims.subject),
            expectedIdentityVersion,
          }),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(
        success({
          recoveryCodeSetId: result.recoveryCodeSetId,
          setVersion: result.setVersion,
          recoveryCodes: result.recoveryCodes,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-MFA-003. Reads the current MFA status. No MFA secrets are exposed.
   */
  @Get('status')
  @RateLimit({ limit: 60, windowSeconds: 60 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-MFA-003', summary: 'Read current MFA status' })
  public async readStatus(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    try {
      const result = await this.mfaEnrollment.readStatus(
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      return success({
        enrollmentState: result.enrollmentState,
        activeFactorTypes: result.activeFactorTypes,
        replacementRequired: result.replacementRequired,
        recoveryCodeCount: result.recoveryCodeCount,
        version: result.version,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof MfaError) {
      switch (error.code) {
        case 'CHALLENGE_INVALID_OR_EXPIRED':
          throw new BadRequestException('CHALLENGE_INVALID_OR_EXPIRED');
        case 'MFA_ENROLLMENT_NOT_PERMITTED':
        case 'RESOURCE_STATE_CONFLICT':
          throw new ConflictException(error.code);
        default:
          throw new BadRequestException(error.code);
      }
    }
    throw error;
  }
}

function parseEnrollmentId(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new BadRequestException('CHALLENGE_INVALID_OR_EXPIRED');
  }
}
