import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentApplicationError } from '../application/errors/payment-application.error';
import { mapPaymentError } from './payment-error-mapping';

describe('mapPaymentError', () => {
  it('maps PAYMENT_NOT_FOUND to NotFoundException', () => {
    expect(() => mapPaymentError(new PaymentApplicationError('PAYMENT_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
  });

  it('maps PAYMENT_ORDER_NOT_FOUND to NotFoundException', () => {
    expect(() => mapPaymentError(new PaymentApplicationError('PAYMENT_ORDER_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
  });

  it('maps PAYMENT_DUPLICATE to ConflictException', () => {
    expect(() => mapPaymentError(new PaymentApplicationError('PAYMENT_DUPLICATE'))).toThrow(
      ConflictException,
    );
  });

  it('maps PAYMENT_OWNERSHIP_DENIED to BadRequestException', () => {
    expect(() => mapPaymentError(new PaymentApplicationError('PAYMENT_OWNERSHIP_DENIED'))).toThrow(
      BadRequestException,
    );
  });

  it('maps PAYMENT_RATE_LIMITED to BadRequestException', () => {
    expect(() => mapPaymentError(new PaymentApplicationError('PAYMENT_RATE_LIMITED'))).toThrow(
      BadRequestException,
    );
  });

  it('maps PAYMENT_WEBHOOK_SIGNATURE_INVALID to generic PAYMENT_ERROR', () => {
    expect(() =>
      mapPaymentError(new PaymentApplicationError('PAYMENT_WEBHOOK_SIGNATURE_INVALID')),
    ).toThrow(BadRequestException);
  });

  it('maps unknown errors to generic PAYMENT_ERROR', () => {
    expect(() => mapPaymentError(new Error('unknown'))).toThrow(BadRequestException);
  });
});
