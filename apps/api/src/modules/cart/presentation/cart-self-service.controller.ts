import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
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
import { RequiresPermission } from '../../authorization/presentation/guards/authorization-permission.guard';
import type { CartApplicationService } from '../application/services/cart-application.service';
import { CART_APPLICATION_SERVICE } from '../cart.tokens';
import { correlationField } from './correlation';
import { mapCartError } from './cart-error-mapping';
import {
  CartSelfServicePermissionGuard,
  type CartScopedRequest,
} from './guards/cart-self-service-permission.guard';
import {
  AddCartItemDto,
  CheckoutHandoffDto,
  ClearCartDto,
  UpdateCartItemQuantityDto,
} from './dto/cart.dto';

/**
 * WEMP-M07-SPEC-001 §14/§17 (M07-M5, decisions D-01…D-10/D-17).
 * Cart self-service API.
 *
 * Authorization model (WEMP-M07-AUTHZ-001 §4, decision D-09):
 * every route requires an ordinary AAL2 session AND the exact approved
 * Module 02 self-service permission via CartSelfServicePermissionGuard,
 * which resolves the caller's OWN customer profile server-side from the
 * authenticated identity (never from a client-supplied customerProfileId)
 * and evaluates the permission through the Module 02 engine with the
 * customer-identity scope (fourth ownership resolver). A caller without
 * a profile, a CLOSED profile, or a denied decision is indistinguishable
 * and denied. The application services additionally re-check ownership
 * and the lifecycle gate — defense in depth; no customer can ever read
 * or mutate another customer's data (D-02).
 *
 * Every mutation requires an Idempotency-Key header (reusing Module 01
 * ApiIdempotencyRecord). Rate limits follow the recorded D-10 policy
 * (self reads 60/hour, self mutations 120/hour — enforced inside the
 * application services; the guard's class-level limiter provides the
 * coarse per-route net). Errors are non-enumerating and never disclose
 * cart, ownership, inventory, or pricing internals.
 *
 * D-17: addItem and clearCart require an Idempotency-Key header. Other
 * mutations are naturally idempotent.
 */
@ApiTags('Cart Self-Service')
@Controller('cart')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class CartSelfServiceController {
  public constructor(
    @Inject(CART_APPLICATION_SERVICE)
    private readonly cart: CartApplicationService,
  ) {}

  // ---------------------------------------------------------------------------
  // READ — GET /cart
  // ---------------------------------------------------------------------------

  @Get()
  @UseGuards(CartSelfServicePermissionGuard)
  @RequiresPermission('cart.read')
  @ApiOperation({
    operationId: 'M07-CART-READ',
    summary: 'Read own active cart with all lines (ACTIVE only; D-07)',
  })
  public async readCart(
    @Req() request: CartScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.cart.getActiveCart(
        request.cartContext.customerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ cart: result }));
    } catch (error) {
      mapCartError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // ADD ITEM — POST /cart/items
  // ---------------------------------------------------------------------------

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 120, windowSeconds: 3600 })
  @UseGuards(CartSelfServicePermissionGuard)
  @RequiresPermission('cart.item.add')
  @ApiOperation({
    operationId: 'M07-CART-ITEM-ADD',
    summary: 'Add a SKU to own cart (auto-creates cart if needed; D-02/D-03/D-06/D-17)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async addItem(
    @Body() body: AddCartItemDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CartScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const cart = await this.cart.addItem({
        customerProfileId: request.cartContext.customerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        skuId: new UuidV7(body.skuId),
        productId: new UuidV7(body.productId),
        skuCode: body.skuCode,
        quantity: body.quantity,
        expectedVersion: body.expectedVersion,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ cart }));
    } catch (error) {
      mapCartError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE QUANTITY — PATCH /cart/items/:cartLineId
  // ---------------------------------------------------------------------------

  @Patch('items/:cartLineId')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 120, windowSeconds: 3600 })
  @UseGuards(CartSelfServicePermissionGuard)
  @RequiresPermission('cart.item.update')
  @ApiOperation({
    operationId: 'M07-CART-ITEM-UPDATE',
    summary: 'Update line quantity in own cart (naturally idempotent; D-04/D-06/D-16)',
  })
  public async updateItemQuantity(
    @Param('cartLineId') cartLineId: string,
    @Body() body: UpdateCartItemQuantityDto,
    @Req() request: CartScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.cart.updateItemQuantity({
        customerProfileId: request.cartContext.customerProfileId,
        cartLineId: parseCartLineParam(cartLineId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        quantity: body.quantity,
        expectedVersion: body.expectedVersion,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ mutation: result }));
    } catch (error) {
      mapCartError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // REMOVE ITEM — DELETE /cart/items/:cartLineId
  // ---------------------------------------------------------------------------

  @Delete('items/:cartLineId')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 120, windowSeconds: 3600 })
  @UseGuards(CartSelfServicePermissionGuard)
  @RequiresPermission('cart.item.remove')
  @ApiOperation({
    operationId: 'M07-CART-ITEM-REMOVE',
    summary: 'Remove a line from own cart (naturally idempotent; D-06/D-16)',
  })
  public async removeItem(
    @Param('cartLineId') cartLineId: string,
    @Body() body: { expectedVersion: number },
    @Req() request: CartScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.cart.removeItem({
        customerProfileId: request.cartContext.customerProfileId,
        cartLineId: parseCartLineParam(cartLineId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ mutation: result }));
    } catch (error) {
      mapCartError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // CLEAR CART — POST /cart/clear
  // ---------------------------------------------------------------------------

  @Post('clear')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 120, windowSeconds: 3600 })
  @UseGuards(CartSelfServicePermissionGuard)
  @RequiresPermission('cart.clear')
  @ApiOperation({
    operationId: 'M07-CART-CLEAR',
    summary: 'Clear all lines from own cart (idempotent; D-06/D-17)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async clearCart(
    @Body() body: ClearCartDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CartScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.cart.clearCart({
        customerProfileId: request.cartContext.customerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ mutation: result }));
    } catch (error) {
      mapCartError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // CHECKOUT HANDOFF — POST /cart/checkout
  // ---------------------------------------------------------------------------

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 120, windowSeconds: 3600 })
  @UseGuards(CartSelfServicePermissionGuard)
  @RequiresPermission('cart.read')
  @ApiOperation({
    operationId: 'M07-CART-CHECKOUT-HANDOFF',
    summary: 'Hand off own cart to Module 08 Orders as immutable snapshot (idempotent; D-08/D-17)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async checkoutHandoff(
    @Body() body: CheckoutHandoffDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CartScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.cart.checkoutHandoff({
        customerProfileId: request.cartContext.customerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ checkout: result }));
    } catch (error) {
      mapCartError(error);
    }
  }
}

/**
 * Validates the `:cartLineId` path parameter is a well-formed UUIDv7
 * (404 otherwise).
 */
function parseCartLineParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('CART_NOT_FOUND');
  }
}
