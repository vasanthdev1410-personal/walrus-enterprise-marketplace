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
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { DirectMtlsIngressService } from '../../authorization/infrastructure/trusted-workload/direct-mtls-ingress.service';
import { SignedBoundaryEvidenceService } from '../../authorization/infrastructure/trusted-workload/signed-boundary-evidence.service';
import { TrustedBoundaryError } from '../../authorization/application/errors/trusted-boundary.error';
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
    private readonly trustedIngress: DirectMtlsIngressService,
    private readonly signedEvidence: SignedBoundaryEvidenceService,
  ) {}

  @Post('super-admin-identity')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 3, windowSeconds: 900 })
  @ApiOperation({ operationId: 'M01-ADM-002', summary: 'Bootstrap super-admin identity' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async bootstrapSuperAdminIdentity(
    @Body() body: BootstrapSuperAdminIdentityRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('walrus-bootstrap-assertion') bootstrapAssertion: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const compactBootstrapAssertion = requiredAssertion(bootstrapAssertion);
      const bootstrapAssertionDigest = digest(compactBootstrapAssertion);
      const workload = await this.trustedIngress.verify(request, 'CONTROLLED_BOOTSTRAP', {
        version: 'walrus.request-binding.v1',
        httpMethod: 'POST',
        routeTemplate: '/api/v1/bootstrap/super-admin-identity',
        contractVersion: 'wemp.m01-m02.authorization.v2',
        body: {
          bootstrapEvidence: body.bootstrapEvidence,
          identifierType: body.identifierType,
          identifier: body.identifier,
          bootstrapAssertionDigest,
        },
        targetReferences: [body.bootstrapEvidence],
        idempotencyKeyDigest: digest(idempotencyKey),
      });
      await this.signedEvidence.verifyBootstrap({
        compact: compactBootstrapAssertion,
        environment: workload.environment,
        operationId: workload.operationId,
        now: new Date(),
      });
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
            workload,
            bootstrapAssertionDigest,
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
    if (error instanceof TrustedBoundaryError) throw new NotFoundException('BOOTSTRAP_UNAVAILABLE');
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

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function requiredAssertion(value: string | undefined): string {
  if (!value || value.includes(',')) throw new NotFoundException('BOOTSTRAP_UNAVAILABLE');
  return value;
}
