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
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthenticatedRequest } from '../../identity-authentication/presentation/authentication-context';
import { Aal2SessionGuard } from '../../identity-authentication/presentation/guards/aal2-session.guard';
import { NonProductionRateLimiterGuard } from '../../identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { RateLimit } from '../../identity-authentication/presentation/decorators/rate-limit.decorator';
import {
  assertIdempotencyKey,
  noStore,
  success,
} from '../../identity-authentication/presentation/http-contract';
import {
  AuthorizationPermissionGuard,
  RequiresPermission,
} from '../../authorization/presentation/guards/authorization-permission.guard';
import type { SellerVerificationApplicationService } from '../application/services/seller-verification-application.service';
import type { SellerAuthorizationApplicationService } from '../application/services/seller-authorization-application.service';
import type { SellerReadApplicationService } from '../application/services/seller-read-application.service';
import {
  SELLER_AUTHORIZATION_APPLICATION_SERVICE,
  SELLER_READ_APPLICATION_SERVICE,
  SELLER_VERIFICATION_APPLICATION_SERVICE,
} from '../seller-management.tokens';
import {
  AdminReactivateDto,
  AdminReviewDto,
  AdminSuspendDto,
} from './dto/seller.dto';
import { mapSellerError } from './seller-error-mapping';
import { correlationField } from './correlation';

/**
 * WEMP-M03-SPEC-001 §13 (M03-M5). Admin/Super Admin seller-management API.
 * Every route requires an ordinary AAL2 session AND the exact approved Module
 * 02 permission (seller.audit.view / seller.review.decide /
 * seller.suspend.manage / seller.evidence.read) via the standard Module 02
 * permission guard. ADMIN and SUPER_ADMIN receive exactly the approved matrix
 * grants — no hidden override. The application services additionally re-check
 * the grants through the SellerAdminAuthorizationPort (defense in depth) and
 * enforce separation of duties (reviewer ≠ approver, no applicant self-
 * approval).
 */
@ApiTags('Admin Seller Management')
@Controller('admin/sellers')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class AdminSellerController {
  public constructor(
    @Inject(SELLER_READ_APPLICATION_SERVICE)
    private readonly read: SellerReadApplicationService,
    @Inject(SELLER_VERIFICATION_APPLICATION_SERVICE)
    private readonly verification: SellerVerificationApplicationService,
    @Inject(SELLER_AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: SellerAuthorizationApplicationService,
  ) {}

  @Get()
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('seller.audit.view')
  @ApiQuery({ name: 'state', required: false, enum: ['DRAFT','SUBMITTED','UNDER_REVIEW','CORRECTIONS_REQUESTED','APPROVED','ACTIVE','SUSPENDED','REJECTED','CLOSED'] })
  @ApiOperation({
    operationId: 'M03-ADMIN-SELLERS-LIST',
    summary: 'List sellers (non-enumerating summary rows; optional state filter)',
  })
  public async listSellers(
    @Query('state') state: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const sellers = await this.read.listSellers(
        new UuidV7(request.authentication.subject),
        parseOptionalState(state),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ sellers }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Get(':sellerProfileId')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('seller.audit.view')
  @ApiOperation({
    operationId: 'M03-ADMIN-SELLER-DETAIL',
    summary: 'Seller detail (profile, organization, members, verification summary)',
  })
  public async sellerDetail(
    @Param('sellerProfileId') sellerProfileId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const detail = await this.read.getSellerDetail(
        new UuidV7(request.authentication.subject),
        parseUuidParam(sellerProfileId),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ seller: detail }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Post(':sellerProfileId/review')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('seller.review.decide')
  @ApiOperation({
    operationId: 'M03-ADMIN-SELLER-REVIEW',
    summary: 'Review a submitted seller: claim review, request corrections, approve, or reject',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async review(
    @Param('sellerProfileId') sellerProfileId: string,
    @Body() body: AdminReviewDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const actorIdentityId = new UuidV7(request.authentication.subject);
    const seller = parseUuidParam(sellerProfileId);
    try {
      let result;
      switch (body.action) {
        case 'CLAIM_REVIEW':
          result = await this.verification.claimReview({
            sellerProfileId: seller,
            reviewerIdentityId: actorIdentityId,
            expectedVersion: body.expectedVersion,
            ...correlationField(),
          });
          break;
        case 'REQUEST_CORRECTIONS':
          requireReason(body.reasonReference);
          result = await this.verification.requestCorrections({
            sellerProfileId: seller,
            reviewerIdentityId: actorIdentityId,
            expectedVersion: body.expectedVersion,
            reasonReference: body.reasonReference ?? '',
            ...correlationField(),
          });
          break;
        case 'APPROVE':
          result = await this.verification.decideReview({
            sellerProfileId: seller,
            approverIdentityId: actorIdentityId,
            expectedVersion: body.expectedVersion,
            decision: 'APPROVED',
            ...correlationField(),
          });
          break;
        case 'REJECT':
          requireReason(body.reasonReference);
          result = await this.verification.decideReview({
            sellerProfileId: seller,
            approverIdentityId: actorIdentityId,
            expectedVersion: body.expectedVersion,
            decision: 'REJECTED',
            reasonReference: body.reasonReference,
            ...correlationField(),
          });
          break;
      }
      noStore(response);
      response.status(HttpStatus.OK).json(success({ seller: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Post(':sellerProfileId/suspend')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('seller.suspend.manage')
  @ApiOperation({
    operationId: 'M03-ADMIN-SELLER-SUSPEND',
    summary: 'Suspend an ACTIVE seller (mandatory reason)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async suspend(
    @Param('sellerProfileId') sellerProfileId: string,
    @Body() body: AdminSuspendDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.authorization.suspendSeller({
        sellerProfileId: parseUuidParam(sellerProfileId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        reasonReference: body.reasonReference,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ seller: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Post(':sellerProfileId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('seller.suspend.manage')
  @ApiOperation({
    operationId: 'M03-ADMIN-SELLER-REACTIVATE',
    summary: 'Reactivate a SUSPENDED seller (role idempotently ensured)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async reactivate(
    @Param('sellerProfileId') sellerProfileId: string,
    @Body() body: AdminReactivateDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.authorization.reactivateSeller({
        sellerProfileId: parseUuidParam(sellerProfileId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ seller: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Get(':sellerProfileId/evidence')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('seller.evidence.read')
  @ApiOperation({
    operationId: 'M03-ADMIN-SELLER-EVIDENCE',
    summary: 'Inspect verification evidence metadata (sensitive; metadata only, never content)',
  })
  public async evidence(
    @Param('sellerProfileId') sellerProfileId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const evidence = await this.read.listEvidenceMetadata(
        new UuidV7(request.authentication.subject),
        parseUuidParam(sellerProfileId),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ evidence }));
    } catch (error) {
      mapSellerError(error);
    }
  }
}

const SELLER_STATES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CORRECTIONS_REQUESTED',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'CLOSED',
] as const;

function parseOptionalState(value: string | undefined): 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'CORRECTIONS_REQUESTED' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'CLOSED' | undefined {
  if (value === undefined) return undefined;
  if ((SELLER_STATES as readonly string[]).includes(value)) {
    return value as (typeof SELLER_STATES)[number];
  }
  throw new BadRequestException('SELLER_PRECONDITION_FAILED');
}

function parseUuidParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('SELLER_NOT_FOUND');
  }
}

function requireReason(value: string | undefined): asserts value is string {
  if (value === undefined || value.trim().length === 0) {
    throw new BadRequestException('SELLER_PRECONDITION_FAILED');
  }
}
