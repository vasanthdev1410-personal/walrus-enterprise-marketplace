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
import type { OrderApplicationService } from '../application/services/order-application.service';
import { ORDER_APPLICATION_SERVICE } from '../order.tokens';
import { correlationField } from './correlation';
import { mapOrderError } from './order-error-mapping';
import {
  OrderSelfServicePermissionGuard,
  type OrderScopedRequest,
} from './guards/order-self-service-permission.guard';
import { CreateOrderDto, CancelOrderDto } from './dto/order.dto';

/**
 * WEMP-M08-SPEC-001 §14/§19 (M08-M5, decisions D-01…D-13). Order self-service
 * API.
 *
 * Authorization model (WEMP-M08-AUTHZ-001 §4, decision D-08):
 * every route requires an ordinary AAL2 session AND the exact approved
 * Module 02 self-service permission via OrderSelfServicePermissionGuard,
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
 * order, ownership, inventory, or pricing internals.
 *
 * D-12: createOrder and cancelOrder require an Idempotency-Key header.
 */
@ApiTags('Order Self-Service')
@Controller('orders')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class OrderSelfServiceController {
  public constructor(
    @Inject(ORDER_APPLICATION_SERVICE)
    private readonly order: OrderApplicationService,
  ) {}

  // ---------------------------------------------------------------------------
  // CREATE ORDER — POST /orders
  // ---------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 120, windowSeconds: 3600 })
  @UseGuards(OrderSelfServicePermissionGuard)
  @RequiresPermission('order.create')
  @ApiOperation({
    operationId: 'M08-ORDER-CREATE',
    summary: 'Create a new order from CartSnapshot (idempotent; D-03/D-04/D-12)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async createOrder(
    @Body() body: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: OrderScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.order.createOrder({
        customerProfileId: request.orderContext.customerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        snapshotId: new UuidV7(body.snapshotId),
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ order: result }));
    } catch (error) {
      mapOrderError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // LIST ORDERS — GET /orders
  // ---------------------------------------------------------------------------

  @Get()
  @UseGuards(OrderSelfServicePermissionGuard)
  @RequiresPermission('order.read')
  @ApiOperation({
    operationId: 'M08-ORDER-LIST',
    summary: 'List own orders (D-01/D-02)',
  })
  public async listOrders(
    @Req() request: OrderScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.order.listOrders({
        customerProfileId: request.orderContext.customerProfileId,
        callerIdentityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ orders: result }));
    } catch (error) {
      mapOrderError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // READ ORDER — GET /orders/:orderId
  // ---------------------------------------------------------------------------

  @Get(':orderId')
  @UseGuards(OrderSelfServicePermissionGuard)
  @RequiresPermission('order.read')
  @ApiOperation({
    operationId: 'M08-ORDER-READ',
    summary: 'Read own order with all lines (non-terminal states only; D-01)',
  })
  public async readOrder(
    @Param('orderId') orderId: string,
    @Req() request: OrderScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.order.readOrder({
        orderId: parseOrderParam(orderId),
        callerIdentityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ order: result }));
    } catch (error) {
      mapOrderError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // CANCEL ORDER — DELETE /orders/:orderId
  // ---------------------------------------------------------------------------

  @Delete(':orderId')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 120, windowSeconds: 3600 })
  @UseGuards(OrderSelfServicePermissionGuard)
  @RequiresPermission('order.create')
  @ApiOperation({
    operationId: 'M08-ORDER-CANCEL',
    summary: 'Cancel own pending order (idempotent; D-01/D-12)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async cancelOrder(
    @Param('orderId') orderId: string,
    @Body() body: CancelOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: OrderScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.order.cancelOrder({
        customerProfileId: request.orderContext.customerProfileId,
        orderId: parseOrderParam(orderId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        reasonReference: body.reasonReference,
        expectedVersion: body.expectedVersion,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ mutation: result }));
    } catch (error) {
      mapOrderError(error);
    }
  }
}

/**
 * Validates the `:orderId` path parameter is a well-formed UUIDv7
 * (404 otherwise).
 */
function parseOrderParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('ORDER_NOT_FOUND');
  }
}
