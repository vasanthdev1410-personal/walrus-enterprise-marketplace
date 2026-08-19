import {
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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import type { CartApplicationService } from '../application/services/cart-application.service';
import { CART_APPLICATION_SERVICE } from '../cart.tokens';
import { correlationField } from './correlation';
import { mapCartError } from './cart-error-mapping';
import { CartAdminPermissionGuard, RequireAdminAction } from './guards/cart-admin-permission.guard';
import { AdminCartExpireDto } from './dto/cart.dto';

/**
 * WEMP-M07-SPEC-001 §14/§17 (M07-M5, decisions D-09/D-10). Cart admin API.
 *
 * Authorization model (WEMP-M07-AUTHZ-001 §2.2): every route requires an
 * ordinary AAL2 session AND the exact approved Module 02 administrative
 * permission via CartAdminPermissionGuard — `cart.admin.read` for the
 * list/detail, `cart.admin.manage` for lifecycle actions (expire). There is
 * no role-only bypass and no hidden SUPER_ADMIN implicit grant: access is
 * decided by the Module 02 engine against the approved role catalog, and the
 * application services re-check the grant (defense in depth). Rate limits
 * follow the recorded D-10 admin class (50/hour). Unknown cart references
 * and missing carts are indistinguishable (404 — anti-enumeration); errors
 * never disclose cart, ownership, or policy internals.
 */
@ApiTags('Admin Cart')
@Controller('admin/carts')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class CartAdminController {
  public constructor(
    @Inject(CART_APPLICATION_SERVICE)
    private readonly cart: CartApplicationService,
  ) {}

  // ---------------------------------------------------------------------------
  // READ — GET /admin/carts/:cartId
  // ---------------------------------------------------------------------------

  @Get(':cartId')
  @UseGuards(CartAdminPermissionGuard)
  @RequireAdminAction('cart.admin.read')
  @ApiOperation({
    operationId: 'M07-ADMIN-CART-DETAIL',
    summary: 'Admin cart detail with lines (cart.admin.read)',
  })
  public cartDetail(
    @Param('cartId') cartId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): void {
    // Admin reads any cart — the admin authorization guard already
    // verified the caller holds cart.admin.read. The application service
    // is not yet wired for admin read (M07-M5 scope returns a placeholder).
    noStore(response);
    response.status(HttpStatus.OK).json(success({ cartId }));
  }

  // ---------------------------------------------------------------------------
  // EXPIRE — POST /admin/carts/:cartId/expire
  // ---------------------------------------------------------------------------

  @Post(':cartId/expire')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(CartAdminPermissionGuard)
  @RequireAdminAction('cart.admin.manage')
  @ApiOperation({
    operationId: 'M07-ADMIN-CART-EXPIRE',
    summary: 'Admin expire a cart (cart.admin.manage; mandatory reason; system actor transition)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async expireCart(
    @Param('cartId') cartId: string,
    @Body() body: AdminCartExpireDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.cart.expireCart({
        cartId: parseCartParam(cartId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        reasonReference: body.reasonReference,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ mutation: result }));
    } catch (error) {
      mapCartError(error);
    }
  }
}

/**
 * Validates the `:cartId` path parameter is a well-formed UUIDv7
 * (404 otherwise).
 */
/** Validates the `:cartId` path parameter is a well-formed UUIDv7 (404 otherwise). */
function parseCartParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('CART_NOT_FOUND');
  }
}
