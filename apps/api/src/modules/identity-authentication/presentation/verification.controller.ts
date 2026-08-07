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
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { VerificationError } from '../application/errors/verification.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { VerificationApplicationService } from '../application/services/verification-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import type { AuthenticatedRequest } from './authentication-context';
import { VERIFICATION_APPLICATION_SERVICE } from './authentication.tokens';
import {
  CommitContactChangeRequestDto,
  VerificationChallengeRequestDto,
  VerificationConfirmationRequestDto,
} from './dto/verification.dto';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { assertIdempotencyKey, etagVersion, noStore, success } from './http-contract';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

@ApiTags('Module 01 Verification')
@Controller('verification-challenges')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class VerificationController {
  public constructor(
    @Inject(VERIFICATION_APPLICATION_SERVICE)
    private readonly verification: VerificationApplicationService,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 3, windowSeconds: 900 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({
    operationId: 'M01-VER-001',
    summary: 'Request a purpose-bound verification challenge (OTP)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async requestChallenge(
    @Body() body: VerificationChallengeRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const claims = request.authentication;
    try {
      const result = await this.idempotency.execute({
        scope: `identity:${claims.subject}`,
        operationType: 'M01-VER-001',
        idempotencyKey,
        request: {
          purpose: body.purpose,
          channelType: body.channelType,
          destination: body.destination,
        },
        execute: () =>
          this.verification.requestChallenge({
            identityId: new UuidV7(claims.subject),
            purpose: body.purpose,
            channelType: body.channelType,
            destination: body.destination,
          }),
      });
      noStore(response);
      response.status(HttpStatus.ACCEPTED).json(
        success({
          challengeId: result.challengeId,
          state: result.state,
          expiresAt: result.expiresAt.toISOString(),
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post(':challengeId/confirmations')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 300 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({
    operationId: 'M01-VER-002',
    summary: 'Confirm a verification challenge with the OTP',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async confirmChallenge(
    @Param('challengeId') challengeId: string,
    @Body() body: VerificationConfirmationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const challengeIdValue = parseChallengeId(challengeId);
    const expectedChallengeVersion = etagVersion(ifMatch, `challenge:${challengeIdValue.value}`);
    const claims = request.authentication;
    try {
      const result = await this.idempotency.execute({
        scope: `identity:${claims.subject}`,
        operationType: 'M01-VER-002',
        idempotencyKey,
        // The OTP evidence is intentionally excluded from the idempotency
        // record so the one-time code is never persisted.
        request: { challengeId, ifMatch },
        execute: () =>
          this.verification.confirmChallenge({
            identityId: new UuidV7(claims.subject),
            challengeId: challengeIdValue,
            expectedChallengeVersion,
            verificationEvidence: body.verificationEvidence,
          }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          challengeId: result.challengeId,
          verificationState: result.verificationState,
          verifiedAt: result.verifiedAt.toISOString(),
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post(':challengeId/commits')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 300 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({
    operationId: 'M01-VER-003',
    summary: 'Commit a verified contact change',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async commitContactChange(
    @Param('challengeId') challengeId: string,
    @Body() body: CommitContactChangeRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    // The commit takes its destination from the verified challenge server-side;
    // the DTO rejects unknown fields through whitelist validation.
    void body;
    assertIdempotencyKey(idempotencyKey);
    const challengeIdValue = parseChallengeId(challengeId);
    const expectedChallengeVersion = etagVersion(ifMatch, `challenge:${challengeIdValue.value}`);
    const claims = request.authentication;
    try {
      const result = await this.idempotency.execute({
        scope: `identity:${claims.subject}`,
        operationType: 'M01-VER-003',
        idempotencyKey,
        request: { challengeId, ifMatch },
        execute: () =>
          this.verification.commitContactChange({
            identityId: new UuidV7(claims.subject),
            challengeId: challengeIdValue,
            expectedChallengeVersion,
          }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          challengeId: result.challengeId,
          contactChange: result.contactChange,
          committedAt: result.committedAt.toISOString(),
          version: result.version,
          primaryIdentifier: result.primaryIdentifier,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof VerificationError) {
      switch (error.code) {
        case 'CHALLENGE_INVALID_OR_EXPIRED':
          throw new UnauthorizedException('CHALLENGE_INVALID_OR_EXPIRED');
        case 'VERIFICATION_NOT_PERMITTED':
          throw new BadRequestException('VERIFICATION_NOT_PERMITTED');
        case 'CHALLENGE_ALREADY_ACTIVE':
        case 'RESOURCE_STATE_CONFLICT':
          throw new ConflictException(error.code);
        default:
          throw new BadRequestException(error.code);
      }
    }
    throw error;
  }
}

function parseChallengeId(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('RESOURCE_NOT_AVAILABLE');
  }
}
