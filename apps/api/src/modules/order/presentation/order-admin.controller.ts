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
import type { OrderApplicationService } from '../application/services/order-application.service';
import { ORDER_APPLICATION_SERVICE } from '../order.tokens';
import { correlationField } from './correlation';
import { mapOrderError } from './order-error-mapping';
import { OrderAdminPermissionGuard, RequireAdminAction } from './guards/order-admin-permission.guard';
import type { OrderState } from '../domain/value-objects/order-state';
import { AdminTransitionOrderDto } from './dto/order.dto';

/**
 * WEMP-M08-SPEC-001 §14/§19 (M08-M5, decisions D-08/D-10). Order admin API.
 *
 * Authorization model (WEMP-M08-AUTHZ-001 §2.2): every route requires an
 * ordinary AAL2 session AND the exact approved Module 02 administrative
 * permission via OrderAdminPermissionGuard — `order.admin.read` for the
 * list/detail, `order.admin.manage` for lifecycle actions (transition).
 * There is no role-only bypass and no hidden SUPER_ADMIN implicit grant:
 * access is decided by the Module 02 engine against the approved role
 * catalog, and the application services re-check the grant (defense in
 * depth). Rate limits follow the recorded D-10 admin class (50/hour).
 * Unknown order references and missing orders are indistinguishable
 * (404 — anti-enumeration); errors never disclose order, ownership, or
 * policy internals.
 */
@ApiTags('Admin Order')
@Controller('admin/orders')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class OrderAdminController {
  public constructor(
    @Inject(ORDER_APPLICATION_SERVICE)
    private readonly order: OrderApplicationService,
  ) {}

  // ---------------------------------------------------------------------------
  // READ — GET /admin/orders/:orderId
  // ---------------------------------------------------------------------------

  @Get(':orderId')
  @UseGuards(OrderAdminPermissionGuard)
  @RequireAdminAction('order.admin.read')
  @ApiOperation({
    operationId: 'M08-ADMIN-ORDER-DETAIL',
    summary: 'Admin order detail with lines (order.admin.read)',
  })
  public async orderDetail(
    @Param('orderId') orderId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.order.readOrder({
        orderId: parseOrderAdminParam(orderId),
        callerIdentityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ order: result }));
    } catch (error) {
      mapOrderError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // TRANSITION — POST /admin/orders/:orderId/transition
  // ---------------------------------------------------------------------------

  @Post(':orderId/transition')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(OrderAdminPermissionGuard)
  @RequireAdminAction('order.admin.manage')
  @ApiOperation({
    operationId: 'M08-ADMIN-ORDER-TRANSITION',
    summary: 'Admin state transition (order.admin.manage; D-01)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async transitionOrder(
    @Param('orderId') orderId: string,
    @Body() body: AdminTransitionOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.order.transitionOrder({
        orderId: parseOrderAdminParam(orderId),
        toState: body.toState as OrderState,
        actorIdentityId: new UuidV7(request.authentication.subject),
        actorKind: 'ADMIN',
        reasonReference: body.reasonReference,
        ...(body.expectedVersion !== undefined ? { expectedVersion: body.expectedVersion } : {}),
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
function parseOrderAdminParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('ORDER_NOT_FOUND');
  }
}
