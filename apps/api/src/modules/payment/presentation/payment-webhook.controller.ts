import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PaymentApplicationService } from '../application/services/payment-application.service';
import { PAYMENT_APPLICATION_SERVICE } from '../payment.tokens';
import { correlationField } from './correlation';
import { mapPaymentError } from './payment-error-mapping';

/**
 * WEMP-M09-SPEC-001 §14/§19 (M09-M5, decision D-06). Payment webhook API.
 *
 * This controller receives provider (Razorpay) webhook events. It does NOT
 * require authentication — the webhook signature verification is the
 * authentication mechanism (HMAC-SHA256). The raw body is passed through
 * for signature verification. The system identity (SYSTEM actor) is used
 * for the webhook processing.
 *
 * Fail closed: invalid signatures, malformed payloads, unknown events,
 * and duplicate events all fail closed. The provider is the only source
 * of truth for payment state — never trust client-reported success.
 *
 * Security: the raw body must be preserved for signature verification.
 * NestJS's default JSON parser is used; the raw body is reconstructed
 * from the parsed body for signature verification.
 */
@ApiTags('Payment Webhook')
@Controller('webhooks/payments')
export class PaymentWebhookController {
  public constructor(
    @Inject(PAYMENT_APPLICATION_SERVICE)
    private readonly payment: PaymentApplicationService,
  ) {}

  // ---------------------------------------------------------------------------
  // RAZORPAY WEBHOOK — POST /webhooks/payments/razorpay
  // ---------------------------------------------------------------------------

  @Post('razorpay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'M09-WEBHOOK-RAZORPAY',
    summary: 'Razorpay webhook endpoint (D-06; signature-verified)',
  })
  public async handleRazorpayWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-razorpay-signature') signatureHeader: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    // The webhook must include a signature header.
    if (signatureHeader === undefined || signatureHeader.length === 0) {
      response.status(HttpStatus.BAD_REQUEST).json({ error: 'INVALID_SIGNATURE' });
      return;
    }

    // Reconstruct the raw body string for signature verification.
    // The parsed body is re-serialized to match the original payload.
    const rawPayload = JSON.stringify(body);

    try {
      // Use a system identity for webhook processing.
      const systemIdentityId = new UuidV7('00000000-0000-7000-8000-000000000000');

      const result = await this.payment.processWebhook({
        rawPayload,
        signatureHeader,
        actorIdentityId: systemIdentityId,
        ...correlationField(),
      });

      response.status(HttpStatus.OK).json({
        status: 'ok',
        paymentId: result.paymentId,
        newState: result.newState,
      });
    } catch (error) {
      // Webhook failures should return 200 to prevent provider retries
      // for permanently failed events (e.g., invalid signature, unknown event).
      // For transient failures, the provider will retry.
      mapPaymentError(error);
    }
  }
}
