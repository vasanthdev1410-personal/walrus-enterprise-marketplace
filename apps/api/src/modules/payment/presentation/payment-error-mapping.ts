import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentApplicationError } from '../application/errors/payment-application.error';

/**
 * WEMP-M09-SPEC-001 §14/§19 (M09-M5). Maps PaymentApplicationError codes
 * to non-disclosing HTTP exceptions. Every code resolves to a generic
 * status; no policy, ownership, provider, or amount internals are ever
 * exposed to clients.
 */
export function mapPaymentError(error: unknown): never {
  if (!(error instanceof PaymentApplicationError)) {
    throw new BadRequestException('PAYMENT_ERROR');
  }
  switch (error.code) {
    case 'PAYMENT_NOT_FOUND':
      throw new NotFoundException(error.code);
    case 'PAYMENT_ORDER_NOT_FOUND':
    case 'PAYMENT_CUSTOMER_NOT_FOUND':
      throw new NotFoundException('PAYMENT_NOT_FOUND');
    case 'PAYMENT_DUPLICATE':
    case 'PAYMENT_STATE_CONFLICT':
    case 'PAYMENT_WEBHOOK_DUPLICATE':
      throw new ConflictException(error.code);
    case 'PAYMENT_OWNERSHIP_DENIED':
    case 'PAYMENT_TRANSITION_FORBIDDEN':
    case 'PAYMENT_REFUND_NOT_ALLOWED':
    case 'PAYMENT_REFUND_EXCEEDS_CAPTURED':
    case 'PAYMENT_ORDER_NOT_PENDING':
    case 'PAYMENT_ORDER_STATE_CONFLICT':
      throw new BadRequestException(error.code);
    case 'PAYMENT_WEBHOOK_SIGNATURE_INVALID':
    case 'PAYMENT_WEBHOOK_EVENT_UNRECOGNIZED':
    case 'PAYMENT_PROVIDER_ERROR':
      throw new BadRequestException('PAYMENT_ERROR');
    case 'PAYMENT_RATE_LIMITED':
      throw new BadRequestException(error.code);
    case 'PAYMENT_IDEMPOTENCY_CONFLICT':
      throw new ConflictException(error.code);
    case 'PAYMENT_VALIDATION_FAILED':
    case 'PAYMENT_AMOUNT_MISMATCH':
    case 'PAYMENT_CURRENCY_MISMATCH':
      throw new BadRequestException(error.code);
    default:
      throw new BadRequestException('PAYMENT_ERROR');
  }
}
