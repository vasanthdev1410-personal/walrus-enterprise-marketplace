import { PaymentId } from './payment-id';
import { PaymentAttemptId } from './payment-attempt-id';
import { PaymentRefundId } from './payment-refund-id';
import { PAYMENT_STATES, TERMINAL_PAYMENT_STATES, isTerminalPaymentState } from './payment-state';

describe('PaymentId', () => {
  it('extends UuidV7', () => {
    const id = new PaymentId('0192a1b2-c3d4-7000-8000-000000000001');
    expect(id).toBeInstanceOf(PaymentId);
  });

  it('creates from a valid UUID string', () => {
    const id = new PaymentId('0192a1b2-c3d4-7000-8000-000000000001');
    expect(id.value).toBe('0192a1b2-c3d4-7000-8000-000000000001');
  });
});

describe('PaymentAttemptId', () => {
  it('extends UuidV7', () => {
    const id = new PaymentAttemptId('0192a1b2-c3d4-7000-8000-000000000001');
    expect(id).toBeInstanceOf(PaymentAttemptId);
  });
});

describe('PaymentRefundId', () => {
  it('extends UuidV7', () => {
    const id = new PaymentRefundId('0192a1b2-c3d4-7000-8000-000000000001');
    expect(id).toBeInstanceOf(PaymentRefundId);
  });
});

describe('PaymentState', () => {
  it('has 7 states', () => {
    expect(PAYMENT_STATES).toHaveLength(7);
  });

  it('has 3 terminal states (FAILED, EXPIRED, REFUNDED)', () => {
    expect(TERMINAL_PAYMENT_STATES).toHaveLength(3);
    expect(TERMINAL_PAYMENT_STATES).toContain('FAILED');
    expect(TERMINAL_PAYMENT_STATES).toContain('EXPIRED');
    expect(TERMINAL_PAYMENT_STATES).toContain('REFUNDED');
  });

  it('isTerminalPaymentState returns true for terminal states', () => {
    expect(isTerminalPaymentState('FAILED')).toBe(true);
    expect(isTerminalPaymentState('EXPIRED')).toBe(true);
    expect(isTerminalPaymentState('REFUNDED')).toBe(true);
  });

  it('isTerminalPaymentState returns false for non-terminal states', () => {
    expect(isTerminalPaymentState('PENDING')).toBe(false);
    expect(isTerminalPaymentState('PROCESSING')).toBe(false);
    expect(isTerminalPaymentState('CAPTURED')).toBe(false);
    expect(isTerminalPaymentState('REFUND_PENDING')).toBe(false);
  });
});
