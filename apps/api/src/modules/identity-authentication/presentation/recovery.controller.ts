import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  PreconditionFailedException,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RecoveryError } from '../application/errors/recovery.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { RecoveryRequestApplicationService } from '../application/services/recovery-request-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import { RECOVERY_REQUEST_APPLICATION_SERVICE } from './authentication.tokens';
import { RecoveryEvidenceDto, RecoveryRequestDto } from './dto/recovery.dto';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import {
  anonymousScope,
  assertIdempotencyKey,
  currentCorrelationId,
  etagVersion,
  noStore,
  success,
} from './http-contract';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

@ApiTags('Module 01 Recovery')
@Controller('recovery-requests')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class RecoveryController {
  public constructor(
    @Inject(RECOVERY_REQUEST_APPLICATION_SERVICE)
    private readonly recoveryRequests: RecoveryRequestApplicationService,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  /**
   * M01-REC-001. Starts an identity recovery request. The endpoint is
   * PUBLIC_ENUMERATION_SAFE: the response always reports acceptance with a
   * recovery-request locator, next action and correlation id without ever
   * confirming whether the locator resolved to an existing identity. The
   * client context is never trusted for identity resolution.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 5, windowSeconds: 900 })
  @ApiOperation({
    operationId: 'M01-REC-001',
    summary: 'Start an enumeration-safe identity recovery request',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async startRecovery(
    @Body() body: RecoveryRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const result = await this.idempotency.execute({
      scope: anonymousScope(request),
      operationType: 'M01-REC-001',
      idempotencyKey,
      // The recovery locator is a verified identifier reference, not a
      // credential; the idempotency fingerprint binds it (as sha256 digest
      // material only) so a key reused with a different locator is rejected.
      request: {
        operationClass: body.operationClass,
        recoveryLocatorType: body.recoveryLocatorType,
        recoveryLocator: body.recoveryLocator,
        clientContext: body.clientContext ?? null,
      },
      execute: () => {
        const correlationId = currentCorrelationId();
        return this.recoveryRequests.startRecovery({
          operationClass: body.operationClass,
          recoveryLocatorType: body.recoveryLocatorType,
          recoveryLocator: body.recoveryLocator,
          idempotencyKey,
          ...(correlationId === undefined ? {} : { correlationId }),
        });
      },
    });
    noStore(response);
    response.status(HttpStatus.ACCEPTED).json(
      success({
        accepted: result.accepted,
        recoveryRequestLocator: result.recoveryRequestLocator,
        nextAction: result.nextAction,
      }),
    );
  }

  /**
   * M01-REC-003. Read-only recovery status. The safe recovery locator in the
   * path is the caller's credential; an unknown locator is answered with 404
   * RESOURCE_NOT_AVAILABLE and never reveals whether a request exists. The
   * response carries only the safe status vocabulary and never mutates state.
   */
  @Get(':recoveryRequestId/status')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 300 })
  @ApiOperation({
    operationId: 'M01-REC-003',
    summary: 'Read the enumeration-safe status of a recovery request',
  })
  public async getStatus(
    @Param('recoveryRequestId') recoveryRequestId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    let requestIdValue: UuidV7;
    try {
      requestIdValue = new UuidV7(recoveryRequestId);
    } catch {
      // A malformed locator is indistinguishable from an unknown one so the
      // response stays uniform and account existence is never revealed.
      throw new NotFoundException('RESOURCE_NOT_AVAILABLE');
    }
    try {
      const result = await this.recoveryRequests.getStatus(requestIdValue);
      noStore(response);
      return success({ ...result });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-REC-002. Submits recovery evidence bound to the recovery request. The
   * recovery-request locator in the path is the caller's Bound Recovery
   * Session credential; Idempotency-Key and the version precondition (If-Match)
   * are both required. Raw evidence is never included in the idempotency
   * fingerprint so a credential can never be persisted in any form. Approved
   * stable errors: RECOVERY_EVIDENCE_REJECTED (400) and RECOVERY_STATE_CONFLICT
   * (412); an unknown or malformed locator is answered uniformly.
   */
  @Post(':recoveryRequestId/evidence')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 900 })
  @ApiOperation({
    operationId: 'M01-REC-002',
    summary: 'Submit recovery evidence for a recovery request',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async submitEvidence(
    @Param('recoveryRequestId') recoveryRequestId: string,
    @Body() body: RecoveryEvidenceDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    let requestIdValue: UuidV7;
    try {
      requestIdValue = new UuidV7(recoveryRequestId);
    } catch {
      // A malformed locator is indistinguishable from an unknown or terminal
      // one, so the response stays uniform and recovery state is never
      // enumerable.
      throw new PreconditionFailedException('RECOVERY_STATE_CONFLICT');
    }
    const expectedRecoveryVersion = etagVersion(
      ifMatch,
      `recovery-request:${requestIdValue.value}`,
    );
    try {
      const result = await this.idempotency.execute({
        // The locator is the Bound Recovery Session credential: the idempotency
        // scope is bound to that recovery request, not to an anonymous client.
        scope: `recovery-request:${requestIdValue.value}`,
        operationType: 'M01-REC-002',
        idempotencyKey,
        // Raw evidence is intentionally excluded so the stored fingerprint
        // never embeds a credential (mirrors M01-MFA-005). Consequence: a key
        // reused with a different evidence value produces the same fingerprint
        // and returns the cached first result rather than IDEMPOTENCY_KEY_REUSED.
        // Clients must use a fresh key per submission attempt.
        request: {
          ifMatch,
          evidenceType: body.evidenceType,
          recoveryPolicyVersion: body.recoveryPolicyVersion,
          protectedEvidenceReference: body.protectedEvidenceReference ?? null,
        },
        execute: () =>
          this.recoveryRequests.submitEvidence({
            recoveryRequestId: requestIdValue,
            expectedRecoveryVersion,
            evidenceType: body.evidenceType,
            recoveryPolicyVersion: body.recoveryPolicyVersion,
            ...(body.evidenceValue === undefined ? {} : { evidenceValue: body.evidenceValue }),
            ...(body.protectedEvidenceReference === undefined
              ? {}
              : { protectedEvidenceReference: body.protectedEvidenceReference }),
          }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          recoveryRequestId: result.recoveryRequestId,
          safeState: result.safeState,
          recoveryAssurance: result.recoveryAssurance,
          nextAction: result.nextAction,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof RecoveryError) {
      // M01-REC-002 exposes only the approved stable errors: evidence failure
      // is 400 RECOVERY_EVIDENCE_REJECTED and any state/version precondition
      // failure is 412 RECOVERY_STATE_CONFLICT. M01-REC-003 answers an unknown
      // or malformed locator with 404 RESOURCE_NOT_AVAILABLE.
      switch (error.code) {
        case 'RECOVERY_EVIDENCE_REJECTED':
          throw new BadRequestException(error.code);
        case 'RECOVERY_STATE_CONFLICT':
          throw new PreconditionFailedException(error.code);
        default:
          throw new NotFoundException(error.code);
      }
    }
    throw error;
  }
}
