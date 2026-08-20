import { PaymentDomainError, type PaymentDomainErrorCode } from './payment-domain.error';

describe('PaymentDomainError', () => {
  it('creates an error with the correct name', () => {
    const error = new PaymentDomainError('PAYMENT_STATE_CONFLICT');
    expect(error.name).toBe('PaymentDomainError');
    expect(error.code).toBe('PAYMENT_STATE_CONFLICT');
  });

  it('is an instance of Error', () => {
    const error = new PaymentDomainError('PAYMENT_NOT_FOUND');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PaymentDomainError);
  });

  it('has a message matching the code', () => {
    const error = new PaymentDomainError('PAYMENT_TRANSITION_FORBIDDEN');
    expect(error.message).toBe('PAYMENT_TRANSITION_FORBIDDEN');
  });

  it('all error codes are valid', () => {
    const codes: PaymentDomainErrorCode[] = [
      'PAYMENT_NOT_FOUND',
      'PAYMENT_OWNERSHIP_DENIED',
      'PAYMENT_STATE_CONFLICT',
      'PAYMENT_TRANSITION_FORBIDDEN',
      'PAYMENT_ACTOR_REQUIRED',
      'PAYMENT_REASON_REQUIRED',
      'PAYMENT_PRECONDITION_FAILED',
      'PAYMENT_UPDATE_FORBIDDEN',
      'PAYMENT_READ_FORBIDDEN',
      'PAYMENT_STALE_VERSION',
      'PAYMENT_DUPLICATE',
      'PAYMENT_AMOUNT_MISMATCH',
      'PAYMENT_CURRENCY_MISMATCH',
      'PAYMENT_ORDER_NOT_FOUND',
      'PAYMENT_ORDER_NOT_PENDING',
      'PAYMENT_CUSTOMER_NOT_FOUND',
      'PAYMENT_WEBHOOK_SIGNATURE_INVALID',
      'PAYMENT_WEBHOOK_DUPLICATE',
      'PAYMENT_PROVIDER_ERROR',
      'PAYMENT_REFUND_EXCEEDS_CAPTURED',
      'PAYMENT_REFUND_NOT_ALLOWED',
      'PAYMENT_RETENTION_CONFIG_MISSING',
      'PAYMENT_RETENTION_CONFIG_INVALID',
    ];
    for (const code of codes) {
      const error = new PaymentDomainError(code);
      expect(error.code).toBe(code);
    }
  });
});
