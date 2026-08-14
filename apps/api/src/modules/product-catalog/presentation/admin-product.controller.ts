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
import type { ProductModerationApplicationService } from '../application/services/product-moderation-application.service';
import type { ProductReadApplicationService } from '../application/services/product-read-application.service';
import type { ProductState } from '../domain/value-objects/product-state';
import { PRODUCT_STATES } from '../domain/value-objects/product-state';
import {
  PRODUCT_MODERATION_APPLICATION_SERVICE,
  PRODUCT_READ_APPLICATION_SERVICE,
} from '../product-catalog.tokens';
import { correlationField } from './correlation';
import { AdminReviewDto } from './dto/product.dto';
import { mapProductError } from './product-error-mapping';

/**
 * WEMP-M04-SPEC-001 §18 (M04-M5). Admin/Super Admin product-management API.
 * Every route requires an ordinary AAL2 session AND the exact approved Module
 * 02 permission (product.audit.view / product.review.decide /
 * product.media.read) via the standard Module 02 permission guard. ADMIN and
 * SUPER_ADMIN receive exactly the approved matrix grants — no hidden override
 * (decision D-11). The application services additionally re-check the grants
 * through ProductAdminAuthorizationPort (defense in depth) and the
 * moderation service enforces separation of duties (reviewer ≠ approver,
 * D-10) and the SYSTEM-gated publication transition (D-12).
 *
 * Every mutation requires an Idempotency-Key header. Rate limits follow the
 * approved D-15 policy (admin review 50/hour). Errors are non-enumerating
 * and never disclose moderation, policy, or media internals.
 */
@ApiTags('Admin Product Catalog')
@Controller('admin/products')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class AdminProductController {
  public constructor(
    @Inject(PRODUCT_READ_APPLICATION_SERVICE)
    private readonly read: ProductReadApplicationService,
    @Inject(PRODUCT_MODERATION_APPLICATION_SERVICE)
    private readonly moderation: ProductModerationApplicationService,
  ) {}

  @Get()
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('product.audit.view')
  @ApiQuery({
    name: 'state',
    required: false,
    enum: [...PRODUCT_STATES],
  })
  @ApiOperation({
    operationId: 'M04-ADMIN-PRODUCTS-LIST',
    summary: 'List products (non-enumerating summary rows; optional state filter)',
  })
  public async listProducts(
    @Query('state') state: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const products = await this.read.listAllProducts(
        new UuidV7(request.authentication.subject),
        parseOptionalState(state),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ products }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Get(':productId')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('product.audit.view')
  @ApiOperation({
    operationId: 'M04-ADMIN-PRODUCT-DETAIL',
    summary: 'Product detail + append-only lifecycle and audit episodes',
  })
  public async productDetail(
    @Param('productId') productId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const product = await this.read.getAdminProductDetail(
        new UuidV7(request.authentication.subject),
        parseUuidParam(productId),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ product }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Post(':productId/review')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('product.review.decide')
  @ApiOperation({
    operationId: 'M04-ADMIN-PRODUCT-REVIEW',
    summary: 'Moderation: claim review, request corrections, approve, reject, or publish',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async review(
    @Param('productId') productId: string,
    @Body() body: AdminReviewDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const product = parseUuidParam(productId);
    const actorIdentityId = new UuidV7(request.authentication.subject);
    try {
      let result;
      switch (body.action) {
        case 'CLAIM_REVIEW':
          result = await this.moderation.claimReview({
            productId: product,
            actorIdentityId,
            expectedVersion: body.expectedVersion,
            ...correlationField(),
          });
          break;
        case 'REQUEST_CORRECTIONS':
          requireReason(body.reasonReference);
          result = await this.moderation.requestCorrections({
            productId: product,
            actorIdentityId,
            expectedVersion: body.expectedVersion,
            reasonReference: body.reasonReference ?? '',
            ...correlationField(),
          });
          break;
        case 'APPROVE':
          result = await this.moderation.decideApproval({
            productId: product,
            actorIdentityId,
            expectedVersion: body.expectedVersion,
            ...correlationField(),
          });
          break;
        case 'REJECT':
          requireReason(body.reasonReference);
          result = await this.moderation.decideRejection({
            productId: product,
            actorIdentityId,
            expectedVersion: body.expectedVersion,
            reasonReference: body.reasonReference ?? '',
            ...correlationField(),
          });
          break;
        case 'PUBLISH':
          result = await this.moderation.publishApproved({
            productId: product,
            actorIdentityId,
            expectedVersion: body.expectedVersion,
            ...correlationField(),
          });
          break;
      }
      noStore(response);
      response.status(HttpStatus.OK).json(success({ product: result }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Get(':productId/media')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('product.media.read')
  @ApiOperation({
    operationId: 'M04-ADMIN-PRODUCT-MEDIA',
    summary: 'Inspect product media metadata (sensitive; metadata only, never content)',
  })
  public async media(
    @Param('productId') productId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const media = await this.read.listAdminMediaMetadata(
        new UuidV7(request.authentication.subject),
        parseUuidParam(productId),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ media }));
    } catch (error) {
      mapProductError(error);
    }
  }
}

function parseOptionalState(value: string | undefined): ProductState | undefined {
  if (value === undefined) return undefined;
  if ((PRODUCT_STATES as readonly string[]).includes(value)) {
    return value as ProductState;
  }
  throw new BadRequestException('PRODUCT_PRECONDITION_FAILED');
}

function parseUuidParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('PRODUCT_NOT_FOUND');
  }
}

function requireReason(value: string | undefined): asserts value is string {
  if (value === undefined || value.trim().length === 0) {
    throw new BadRequestException('PRODUCT_PRECONDITION_FAILED');
  }
}
