import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
import type { AuthenticatedRequest } from './authentication-context';
import {
  RecoveryApprovalDecisionDto,
  RecoveryApprovalRequestDto,
  RecoveryEvidenceDto,
  RecoveryExecutionDto,
  RecoveryRequestDto,
} from './dto/recovery.dto';
import { Aal2SessionGuard } from './guards/aal2-session.guard';
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

  /**
   * M01-REC-004. Requests human approval when the deterministic policy row
   * requires it. The recovery-request locator in the path is the caller's
   * Bound Recovery Session credential; Idempotency-Key and the version
   * precondition (If-Match) are both required. A policy row that requires no
   * human approval is answered with 409 RECOVERY_APPROVAL_NOT_REQUIRED and the
   * recovery proceeds to execution (skipping APPROVAL_PENDING); any state,
   * version or eligibility precondition failure is 412 RECOVERY_STATE_CONFLICT.
   * No sensitive recovery material is ever returned.
   */
  @Post(':recoveryRequestId/approval-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 5, windowSeconds: 900 })
  @ApiOperation({
    operationId: 'M01-REC-004',
    summary: 'Request human approval for a recovery request when policy requires it',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async requestApproval(
    @Param('recoveryRequestId') recoveryRequestId: string,
    @Body() body: RecoveryApprovalRequestDto,
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
        operationType: 'M01-REC-004',
        idempotencyKey,
        // The fingerprint carries only the version precondition and the
        // confirmed policy version; no approval or recovery material is ever
        // persisted with it.
        request: {
          ifMatch,
          recoveryPolicyVersion: body.recoveryPolicyVersion,
        },
        execute: () =>
          this.recoveryRequests.requestApproval({
            recoveryRequestId: requestIdValue,
            expectedRecoveryVersion,
            recoveryPolicyVersion: body.recoveryPolicyVersion,
          }),
      });
      noStore(response);
      response.status(HttpStatus.ACCEPTED).json(
        success({
          safeState: result.safeState,
          approvalRequired: result.approvalRequired,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-REC-005. Records an approver decision on an APPROVAL_PENDING recovery
   * request. The endpoint is MODULE_02_AUTHORIZED: the approver must hold an
   * ordinary AAL2 session (guard) and a current Module 02 authorization
   * decision is obtained through the approved boundary at decision time. The
   * recovery-request locator in the path identifies the request; the version
   * precondition (If-Match) guards the aggregate write and Idempotency-Key is
   * required. Stable errors: AUTHORIZATION_DENIED (403) when Module 02 denies
   * the approver, RECOVERY_APPROVAL_INVALID (403) for any invalid, expired,
   * duplicate, self-approved or unauthorized approval attempt.
   */
  @Post(':recoveryRequestId/approval-decisions')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 900 })
  @UseGuards(Aal2SessionGuard)
  @ApiOperation({
    operationId: 'M01-REC-005',
    summary: 'Record an approver decision for a recovery request',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async recordApprovalDecision(
    @Param('recoveryRequestId') recoveryRequestId: string,
    @Body() body: RecoveryApprovalDecisionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    let requestIdValue: UuidV7;
    try {
      requestIdValue = new UuidV7(recoveryRequestId);
    } catch {
      // A malformed locator is indistinguishable from an unknown or invalid
      // one, so the response stays uniform and recovery state is never
      // enumerable.
      throw new ForbiddenException('RECOVERY_APPROVAL_INVALID');
    }
    const expectedRecoveryVersion = etagVersion(
      ifMatch,
      `recovery-request:${requestIdValue.value}`,
    );
    try {
      const result = await this.idempotency.execute({
        // The recovery request is the approval subject; the idempotency scope
        // is bound to it so a key cannot be replayed across requests. The
        // fingerprint carries only the decision metadata and the version
        // precondition; no authorization or recovery material is stored.
        scope: `recovery-request:${requestIdValue.value}`,
        operationType: 'M01-REC-005',
        idempotencyKey,
        request: {
          ifMatch,
          decision: body.decision,
          recoveryOperationClass: body.recoveryOperationClass,
          approvalReasonCode: body.approvalReasonCode,
          approvalExpiresAt: body.approvalExpiresAt,
        },
        execute: () =>
          this.recoveryRequests.recordApprovalDecision({
            recoveryRequestId: requestIdValue,
            // The authenticated ordinary AAL2 session subject is the approver;
            // the client can never claim another identity.
            approverIdentityId: new UuidV7(request.authentication.subject),
            expectedRecoveryVersion,
            decision: body.decision,
            recoveryOperationClass: body.recoveryOperationClass,
            approvalReasonCode: body.approvalReasonCode,
            approvalExpiresAt: body.approvalExpiresAt,
          }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          recoveryRequestId: result.recoveryRequestId,
          recordedDecision: result.recordedDecision,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-REC-006. Executes an approved recovery.
   *
   * The recovery-request locator in the path is the caller's Bound Recovery
   * Session credential; the version precondition (If-Match) guards the
   * aggregate write and Idempotency-Key is required. The caller confirms the
   * permitted operation the recovery session is bound to; the server completes
   * the recovery atomically, applies the mandatory invalidation effects and
   * requires fresh authentication afterwards. Stable errors:
   * RECOVERY_APPROVAL_REQUIRED (409) when the required approvals are
   * incomplete, RECOVERY_STATE_CONFLICT (412) for any other invalid, stale,
   * expired or already-completed execution attempt.
   */
  @Post(':recoveryRequestId/execution')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 900 })
  @ApiOperation({
    operationId: 'M01-REC-006',
    summary: 'Execute an approved recovery',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async executeRecovery(
    @Param('recoveryRequestId') recoveryRequestId: string,
    @Body() body: RecoveryExecutionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    let requestIdValue: UuidV7;
    try {
      requestIdValue = new UuidV7(recoveryRequestId);
    } catch {
      // A malformed locator is indistinguishable from an unknown or invalid
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
        // The recovery request is the execution subject; the idempotency scope
        // is bound to it so a key cannot be replayed across requests. The
        // fingerprint carries only the operation confirmation and the version
        // precondition; no recovery or credential material is stored.
        scope: `recovery-request:${requestIdValue.value}`,
        operationType: 'M01-REC-006',
        idempotencyKey,
        request: {
          permittedOperation: body.permittedOperation,
          recoveryPolicyVersion: body.recoveryPolicyVersion,
          ifMatch,
        },
        execute: () =>
          this.recoveryRequests.executeRecovery({
            recoveryRequestId: requestIdValue,
            expectedRecoveryVersion,
            permittedOperation: body.permittedOperation,
            recoveryPolicyVersion: body.recoveryPolicyVersion,
          }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          recoveryRequestId: result.recoveryRequestId,
          safeState: result.safeState,
          reauthenticationRequired: result.reauthenticationRequired,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof RecoveryError) {
      // The recovery surface exposes only the approved stable errors:
      // M01-REC-002 evidence failure is 400 RECOVERY_EVIDENCE_REJECTED;
      // M01-REC-004 answers 409 RECOVERY_APPROVAL_NOT_REQUIRED when the policy
      // row requires no human approval; M01-REC-005 answers 403
      // AUTHORIZATION_DENIED (Module 02 denied) or 403 RECOVERY_APPROVAL_INVALID
      // (invalid, expired, duplicate, self-approved or unauthorized approval);
      // M01-REC-006 answers 409 RECOVERY_APPROVAL_REQUIRED when the required
      // approvals are incomplete; any state/version precondition failure is
      // 412 RECOVERY_STATE_CONFLICT; M01-REC-003 answers an unknown or
      // malformed locator with 404 RESOURCE_NOT_AVAILABLE.
      switch (error.code) {
        case 'RECOVERY_EVIDENCE_REJECTED':
          throw new BadRequestException(error.code);
        case 'RECOVERY_APPROVAL_NOT_REQUIRED':
        case 'RECOVERY_APPROVAL_REQUIRED':
          throw new ConflictException(error.code);
        case 'AUTHORIZATION_DENIED':
        case 'RECOVERY_APPROVAL_INVALID':
          throw new ForbiddenException(error.code);
        case 'RECOVERY_STATE_CONFLICT':
          throw new PreconditionFailedException(error.code);
        default:
          throw new NotFoundException(error.code);
      }
    }
    throw error;
  }
}
