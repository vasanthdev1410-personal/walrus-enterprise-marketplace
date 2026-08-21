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
import type { PaymentApplicationService } from '../application/services/payment-application.service';
import { PAYMENT_APPLICATION_SERVICE } from '../payment.tokens';
import { correlationField } from './correlation';
import { mapPaymentError } from './payment-error-mapping';
import {
  PaymentAdminPermissionGuard,
  RequirePaymentAdminAction,
} from './guards/payment-admin-permission.guard';
import { AdminInitiateRefundDto } from './dto/payment.dto';

/**
 * WEMP-M09-SPEC-001 §14/§19 (M09-M5). Payment admin API.
 *
 * Authorization model: every route requires an AAL2 session and the
 * approved Module 02 administrative permission via PaymentAdminPermissionGuard.
 * Rate limits: admin 50/hr.
 */
@ApiTags('Admin Payment')
@Controller('admin/payments')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class PaymentAdminController {
  public constructor(
    @Inject(PAYMENT_APPLICATION_SERVICE)
    private readonly payment: PaymentApplicationService,
  ) {}

  // ---------------------------------------------------------------------------
  // READ — GET /admin/payments/:paymentId
  // ---------------------------------------------------------------------------

  @Get(':paymentId')
  @UseGuards(PaymentAdminPermissionGuard)
  @RequirePaymentAdminAction('payment.admin.read')
  @ApiOperation({
    operationId: 'M09-ADMIN-PAYMENT-DETAIL',
    summary: 'Admin payment detail (payment.admin.read)',
  })
  public async paymentDetail(
    @Param('paymentId') paymentId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.payment.readPayment({
        paymentId: parsePaymentAdminParam(paymentId),
        callerIdentityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ payment: result }));
    } catch (error) {
      mapPaymentError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // INITIATE REFUND — POST /admin/payments/:paymentId/refund
  // ---------------------------------------------------------------------------

  @Post(':paymentId/refund')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(PaymentAdminPermissionGuard)
  @RequirePaymentAdminAction('payment.admin.manage')
  @ApiOperation({
    operationId: 'M09-ADMIN-PAYMENT-REFUND',
    summary: 'Admin initiate refund (payment.admin.manage; D-04)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async initiateRefund(
    @Param('paymentId') paymentId: string,
    @Body() body: AdminInitiateRefundDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.payment.initiateRefund({
        actorIdentityId: new UuidV7(request.authentication.subject),
        paymentId: parsePaymentAdminParam(paymentId),
        amountCents: body.amountCents,
        reasonReference: body.reasonReference,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ mutation: result }));
    } catch (error) {
      mapPaymentError(error);
    }
  }
}

function parsePaymentAdminParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('PAYMENT_NOT_FOUND');
  }
}
