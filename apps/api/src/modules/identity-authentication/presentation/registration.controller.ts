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
import type { Request, Response } from 'express';
import { RegistrationError } from '../application/errors/registration.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { RegistrationApplicationService } from '../application/services/registration-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import { REGISTRATION_APPLICATION_SERVICE } from './authentication.tokens';
import {
  ActivationRequestDto,
  RegisterRegistrationRequestDto,
  VerificationChallengeRequestDto,
  VerificationConfirmationRequestDto,
} from './dto/registration.dto';
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

@ApiTags('Module 01 Registration')
@Controller('registrations')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class RegistrationController {
  public constructor(
    @Inject(REGISTRATION_APPLICATION_SERVICE)
    private readonly registrations: RegistrationApplicationService,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 10, windowSeconds: 900 })
  @ApiOperation({ operationId: 'M01-REG-001', summary: 'Start an identity registration' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async startRegistration(
    @Body() body: RegisterRegistrationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.idempotency.execute({
        scope: anonymousScope(request),
        operationType: 'M01-REG-001',
        idempotencyKey,
        // The password is intentionally excluded from the idempotency record so
        // the stored fingerprint never embeds recoverable credential material.
        request: {
          identifierType: body.identifierType,
          identifier: body.identifier,
          ...(body.classification === undefined
            ? {}
            : { classification: body.classification }),
        },
        execute: () =>
          this.registrations.register({
            identifierType: body.identifierType,
            identifier: body.identifier,
            password: body.password,
            ...(body.classification === undefined
              ? {}
              : { classification: body.classification }),
          }),
      });
      noStore(response);
      response.status(HttpStatus.ACCEPTED).json(
        success({
          registrationId: result.registrationId,
          status: result.status,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post(':registrationId/verification-challenges')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 3, windowSeconds: 900 })
  @ApiOperation({
    operationId: 'M01-REG-002',
    summary: 'Request a registration verification challenge (OTP)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async requestVerificationChallenge(
    @Param('registrationId') registrationId: string,
    @Body() body: VerificationChallengeRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const registrationIdValue = parseRegistrationId(registrationId);
    const expectedVersion = etagVersion(ifMatch, `registration:${registrationIdValue.value}`);
    try {
      const result = await this.idempotency.execute({
        scope: `registration:${registrationIdValue.value}`,
        operationType: 'M01-REG-002',
        idempotencyKey,
        request: { registrationId, ifMatch, channelType: body.channelType },
        execute: () =>
          this.registrations.requestVerificationChallenge({
            registrationId: registrationIdValue,
            expectedVersion,
            channelType: body.channelType,
          }),
      });
      noStore(response);
      response.status(HttpStatus.ACCEPTED).json(
        success({
          challengeId: result.challengeId,
          version: result.version,
          expiresAt: result.expiresAt.toISOString(),
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post(':registrationId/verification-confirmations')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 300 })
  @ApiOperation({
    operationId: 'M01-REG-003',
    summary: 'Confirm registration verification with the OTP',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async confirmVerification(
    @Param('registrationId') registrationId: string,
    @Body() body: VerificationConfirmationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const registrationIdValue = parseRegistrationId(registrationId);
    // The DTO validates the challenge id format before the handler runs.
    const challengeIdValue = new UuidV7(body.challengeId);
    const expectedChallengeVersion = etagVersion(ifMatch, `challenge:${challengeIdValue.value}`);
    try {
      const result = await this.idempotency.execute({
        scope: `registration:${registrationIdValue.value}`,
        operationType: 'M01-REG-003',
        idempotencyKey,
        // The OTP evidence is intentionally excluded from the idempotency record
        // so the one-time code is never persisted in any form.
        request: { registrationId, challengeId: body.challengeId, ifMatch },
        execute: () =>
          this.registrations.confirmVerification({
            registrationId: registrationIdValue,
            challengeId: challengeIdValue,
            expectedChallengeVersion,
            verificationEvidence: body.verificationEvidence,
          }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          status: result.status,
          registrationId: result.registrationId,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post(':registrationId/activation')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 300 })
  @ApiOperation({ operationId: 'M01-REG-004', summary: 'Activate a verified registration' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async activate(
    @Param('registrationId') registrationId: string,
    @Body() body: ActivationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    void body;
    assertIdempotencyKey(idempotencyKey);
    const registrationIdValue = parseRegistrationId(registrationId);
    const expectedVersion = etagVersion(ifMatch, `registration:${registrationIdValue.value}`);
    try {
      const result = await this.idempotency.execute({
        scope: `registration:${registrationIdValue.value}`,
        operationType: 'M01-REG-004',
        idempotencyKey,
        request: { registrationId, ifMatch },
        execute: () =>
          this.registrations.activate({ registrationId: registrationIdValue, expectedVersion }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          status: result.status,
          identityState: result.identityState,
          verificationState: result.verificationState,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get(':registrationId/status')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'M01-REG-005',
    summary: 'Retrieve enumeration-safe registration status',
  })
  public async registrationStatus(
    @Param('registrationId') registrationId: string,
    @Res() response: Response,
  ): Promise<void> {
    const registrationIdValue = parseRegistrationId(registrationId);
    try {
      const result = await this.registrations.getStatus(registrationIdValue);
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          registrationId: result.registrationId,
          status: result.status,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof RegistrationError) {
      switch (error.code) {
        case 'REGISTRATION_NOT_FOUND':
          throw new NotFoundException('RESOURCE_NOT_AVAILABLE');
        case 'CHALLENGE_INVALID_OR_EXPIRED':
          throw new UnauthorizedException('CHALLENGE_INVALID_OR_EXPIRED');
        case 'VERIFICATION_NOT_PERMITTED':
          throw new BadRequestException('VERIFICATION_NOT_PERMITTED');
        case 'REGISTRATION_STATE_CONFLICT':
        case 'CHALLENGE_ALREADY_ACTIVE':
        case 'REGISTRATION_NOT_READY':
          throw new ConflictException(error.code);
        default:
          throw new BadRequestException(error.code);
      }
    }
    throw error;
  }
}

function parseRegistrationId(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('RESOURCE_NOT_AVAILABLE');
  }
}

