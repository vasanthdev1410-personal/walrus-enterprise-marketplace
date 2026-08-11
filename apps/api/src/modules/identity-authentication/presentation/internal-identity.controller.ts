import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import type { Response } from 'express';
import { ClassificationTransitionError } from '../application/errors/classification-transition.error';
import { IdentityLifecycleError } from '../application/errors/identity-lifecycle.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { ClassificationTransitionApplicationService } from '../application/services/classification-transition-application.service';
import type { IdentityLifecycleApplicationService } from '../application/services/identity-lifecycle-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import type { AuthenticatedRequest } from './authentication-context';
import {
  CLASSIFICATION_TRANSITION_APPLICATION_SERVICE,
  IDENTITY_LIFECYCLE_APPLICATION_SERVICE,
} from './authentication.tokens';
import { ClassificationTransitionRequestDto } from './dto/classification-transition.dto';
import { IdentityStateTransitionRequestDto } from './dto/identity-lifecycle.dto';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { assertIdempotencyKey, etagVersion, noStore, success } from './http-contract';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

@ApiTags('Module 01 Internal Identity')
@Controller('internal/identities')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class InternalIdentityController {
  public constructor(
    @Inject(IDENTITY_LIFECYCLE_APPLICATION_SERVICE)
    private readonly lifecycle: IdentityLifecycleApplicationService,
    @Inject(CLASSIFICATION_TRANSITION_APPLICATION_SERVICE)
    private readonly classifications: ClassificationTransitionApplicationService,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  /**
   * M01-ID-004. Module 02-authorized identity authentication-state transition.
   * The caller must hold an ordinary Session; a current Module 02
   * authorization decision is obtained through the narrow authorization port
   * at decision time (AUTHORIZATION_DENIED otherwise — an ordinary Session
   * alone never authorizes a privileged state change). The identity version
   * (If-Match) guards the write and the approved Part 1 transition matrix is
   * enforced server-side; DELETED is privacy-gated and cannot be requested.
   */
  @Post(':identityId/state-transitions')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-ID-004', summary: 'Transition identity state' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async changeIdentityState(
    @Param('identityId') identityId: string,
    @Body() body: IdentityStateTransitionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const targetIdentityId = parseIdentityId(identityId);
    const expectedIdentityVersion = etagVersion(ifMatch, `identity:${identityId}`);
    const claims = request.authentication;
    try {
      const result = await this.idempotency.execute({
        scope: `identity:${identityId}`,
        operationType: 'M01-ID-004',
        idempotencyKey,
        request: {
          targetIdentityState: body.targetIdentityState,
          sourceContractReference: body.sourceContractReference,
          ifMatch,
        },
        execute: () =>
          this.lifecycle.changeIdentityState({
            actorIdentityId: new UuidV7(claims.subject),
            targetIdentityId,
            targetIdentityState: body.targetIdentityState,
            reasonCode: body.reasonCode,
            sourceContractReference: body.sourceContractReference,
            expectedIdentityVersion,
          }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          identityId: result.identityId,
          identityState: result.identityState,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-CLS-001. Internal authentication-security-classification transition.
   * The request is INTERNAL_SERVICE: the versioned source contract reference
   * is validated through the narrow approved coordination-contract port at
   * decision time (CONTRACT_INVALID when no approved contract is present — a
   * service Session alone never changes a classification). The identity
   * version (If-Match) guards the write; the current EFFECTIVE assignment is
   * atomically ENDED while a new EFFECTIVE assignment is created in the same
   * version-guarded aggregate write. A classification only selects
   * authentication controls and never grants permissions.
   */
  @Post(':identityId/authentication-classification-transitions')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-CLS-001', summary: 'Transition authentication classification' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async transitionClassification(
    @Param('identityId') identityId: string,
    @Body() body: ClassificationTransitionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const targetIdentityId = parseIdentityId(identityId);
    const expectedIdentityVersion = etagVersion(ifMatch, `identity:${identityId}`);
    const claims = request.authentication;
    try {
      const result = await this.idempotency.execute({
        scope: `identity:${identityId}`,
        operationType: 'M01-CLS-001',
        idempotencyKey,
        request: {
          targetAuthenticationSecurityClassification:
            body.targetAuthenticationSecurityClassification,
          sourceContractReference: body.sourceContractReference,
          ifMatch,
        },
        execute: () =>
          this.classifications.transitionClassification({
            actorIdentityId: new UuidV7(claims.subject),
            targetIdentityId,
            targetAuthenticationSecurityClassification:
              body.targetAuthenticationSecurityClassification,
            reasonCode: body.reasonCode,
            sourceContractReference: body.sourceContractReference,
            expectedIdentityVersion,
          }),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          identityId: result.identityId,
          authenticationSecurityClassification: result.authenticationSecurityClassification,
          version: result.version,
        }),
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof IdentityLifecycleError) {
      switch (error.code) {
        case 'AUTHORIZATION_DENIED':
          throw new ForbiddenException(error.code);
        case 'RESOURCE_STATE_CONFLICT':
          throw new PreconditionFailedException(error.code);
        case 'RESOURCE_NOT_AVAILABLE':
          throw new NotFoundException(error.code);
        default:
          throw error;
      }
    }
    if (error instanceof ClassificationTransitionError) {
      switch (error.code) {
        case 'CONTRACT_INVALID':
          throw new BadRequestException(error.code);
        case 'RESOURCE_STATE_CONFLICT':
          throw new PreconditionFailedException(error.code);
        case 'RESOURCE_NOT_AVAILABLE':
        default:
          throw new NotFoundException(error.code);
      }
    }
    throw error;
  }
}

function parseIdentityId(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    // A malformed locator is indistinguishable from an unknown identity, so
    // the response stays uniform and identity state is never enumerable.
    throw new NotFoundException('RESOURCE_NOT_AVAILABLE');
  }
}
