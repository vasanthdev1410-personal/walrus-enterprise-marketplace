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
import { RequiresPermission } from '../../authorization/presentation/guards/authorization-permission.guard';
import type { PaymentApplicationService } from '../application/services/payment-application.service';
import { PAYMENT_APPLICATION_SERVICE } from '../payment.tokens';
import { correlationField } from './correlation';
import { mapPaymentError } from './payment-error-mapping';
import {
  PaymentSelfServicePermissionGuard,
  type PaymentScopedRequest,
} from './guards/payment-self-service-permission.guard';
import { InitiatePaymentDto } from './dto/payment.dto';

/**
 * WEMP-M09-SPEC-001 §14/§19 (M09-M5). Payment self-service API.
 *
 * Authorization model: every route requires an AAL2 session and the
 * approved Module 02 self-service permission via PaymentSelfServicePermissionGuard,
 * which resolves the caller's own customer profile server-side and evaluates
 * the permission through the Module 02 engine with customer-identity scope.
 *
 * D-12: initiatePayment requires an Idempotency-Key header.
 * Rate limits: self reads 60/hr, self mutations 120/hr.
 */
@ApiTags('Payment Self-Service')
@Controller('payments')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class PaymentSelfServiceController {
  public constructor(
    @Inject(PAYMENT_APPLICATION_SERVICE)
    private readonly payment: PaymentApplicationService,
  ) {}

  // ---------------------------------------------------------------------------
  // INITIATE PAYMENT — POST /payments
  // ---------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 120, windowSeconds: 3600 })
  @UseGuards(PaymentSelfServicePermissionGuard)
  @RequiresPermission('payment.initiate')
  @ApiOperation({
    operationId: 'M09-PAYMENT-INITIATE',
    summary: 'Initiate a payment for an order (idempotent; D-05/D-12)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async initiatePayment(
    @Body() body: InitiatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: PaymentScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.payment.initiatePayment({
        customerProfileId: request.paymentContext.customerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        orderId: parsePaymentParam(body.orderId),
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ payment: result }));
    } catch (error) {
      mapPaymentError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // READ PAYMENT — GET /payments/:paymentId
  // ---------------------------------------------------------------------------

  @Get(':paymentId')
  @UseGuards(PaymentSelfServicePermissionGuard)
  @RequiresPermission('payment.read')
  @ApiOperation({
    operationId: 'M09-PAYMENT-READ',
    summary: 'Read own payment details',
  })
  public async readPayment(
    @Param('paymentId') paymentId: string,
    @Req() request: PaymentScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.payment.readPayment({
        paymentId: parsePaymentParam(paymentId),
        callerIdentityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ payment: result }));
    } catch (error) {
      mapPaymentError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // READ PAYMENT BY ORDER — GET /payments/order/:orderId
  // ---------------------------------------------------------------------------

  @Get('order/:orderId')
  @UseGuards(PaymentSelfServicePermissionGuard)
  @RequiresPermission('payment.read')
  @ApiOperation({
    operationId: 'M09-PAYMENT-READ-BY-ORDER',
    summary: 'Read the payment for an order',
  })
  public async readPaymentByOrder(
    @Param('orderId') orderId: string,
    @Req() request: PaymentScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.payment.readPaymentByOrder({
        orderId: parsePaymentParam(orderId),
        callerIdentityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ payment: result }));
    } catch (error) {
      mapPaymentError(error);
    }
  }
}

function parsePaymentParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('PAYMENT_NOT_FOUND');
  }
}
