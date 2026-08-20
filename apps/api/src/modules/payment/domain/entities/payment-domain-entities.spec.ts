import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { PaymentId } from '../value-objects/payment-id';
import { PaymentAttemptId } from '../value-objects/payment-attempt-id';
import { PaymentRefundId } from '../value-objects/payment-refund-id';
import { Payment } from './payment';
import { PaymentAttempt } from './payment-attempt';
import { PaymentRefund, isTerminalRefundState } from './payment-refund';
import { PaymentStateTransition } from './payment-state-transition';
import { PaymentAuditRecord } from './payment-audit-record';

const PAYMENT_UUID = new PaymentId('0192a1b2-c3d4-7000-8000-000000000001');
const ORDER_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const PROFILE_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const ACTOR_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const TRANSITION_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000005');
const AUDIT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000006');
const REFUND_UUID = new PaymentRefundId('0192a1b2-c3d4-7000-8000-000000000007');
const ATTEMPT_UUID = new PaymentAttemptId('0192a1b2-c3d4-7000-8000-000000000008');

const NOW = new Date('2026-08-20T12:00:00.000Z');
const LATER = new Date('2026-08-20T12:01:00.000Z');

function makePayment(overrides?: Partial<Parameters<typeof createPayment>[0]>): Payment {
  return createPayment({
    state: 'PENDING',
    amountCents: 1999,
    ...overrides,
  });
}

function createPayment(opts: {
  state?: string;
  amountCents?: number;
  currency?: string;
  provider?: string;
  idempotencyKey?: string;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
} = {}): Payment {
  return new Payment({
    paymentId: PAYMENT_UUID,
    orderId: ORDER_UUID,
    customerProfileId: PROFILE_UUID,
    state: (opts.state ?? 'PENDING') as never,
    amountCents: opts.amountCents ?? 1999,
    currency: opts.currency ?? 'INR',
    provider: opts.provider ?? 'razorpay',
    providerOrderId: opts.providerOrderId ?? null,
    providerPaymentId: opts.providerPaymentId ?? null,
    idempotencyKey: opts.idempotencyKey ?? 'idem-key-001',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('Payment', () => {
  it('creates a valid payment', () => {
    const payment = makePayment();
    expect(payment.properties.paymentId).toBe(PAYMENT_UUID);
    expect(payment.properties.orderId).toBe(ORDER_UUID);
    expect(payment.properties.state).toBe('PENDING');
    expect(payment.properties.amountCents).toBe(1999);
    expect(payment.properties.currency).toBe('INR');
    expect(payment.properties.provider).toBe('razorpay');
  });

  it('rejects zero amount', () => {
    expect(() => makePayment({ amountCents: 0 })).toThrow('amountCents must be greater than zero');
  });

  it('rejects negative amount', () => {
    expect(() => makePayment({ amountCents: -1 })).toThrow('amountCents must be a non-negative safe integer');
  });

  it('rejects invalid currency code', () => {
    expect(() => makePayment({ currency: 'usd' })).toThrow('ISO 4217 alpha-3');
  });

  it('rejects empty provider', () => {
    expect(() => makePayment({ provider: '' })).toThrow('provider is required');
  });

  it('rejects empty idempotencyKey', () => {
    expect(() => makePayment({ idempotencyKey: '' })).toThrow('idempotencyKey is required');
  });

  it('rejects updatedAt before createdAt', () => {
    expect(
      () =>
        new Payment({
          paymentId: PAYMENT_UUID,
          orderId: ORDER_UUID,
          customerProfileId: PROFILE_UUID,
          state: 'PENDING',
          amountCents: 1999,
          currency: 'INR',
          provider: 'razorpay',
          providerOrderId: null,
          providerPaymentId: null,
          idempotencyKey: 'key',
          aggregateVersion: new AggregateVersion(1),
          createdAt: LATER,
          updatedAt: NOW,
        }),
    ).toThrow('updatedAt cannot precede createdAt');
  });

  it('is frozen after construction', () => {
    const payment = makePayment();
    expect(Object.isFrozen(payment)).toBe(true);
    expect(Object.isFrozen(payment.properties)).toBe(true);
  });
});

describe('PaymentAttempt', () => {
  it('creates a valid attempt', () => {
    const attempt = new PaymentAttempt({
      paymentAttemptId: ATTEMPT_UUID,
      paymentId: PAYMENT_UUID,
      providerPaymentId: 'pay_abc123',
      outcome: 'INITIATED',
      providerResponseDigest: null,
      attemptedAt: NOW,
      createdAt: NOW,
    });
    expect(attempt.properties.outcome).toBe('INITIATED');
    expect(attempt.properties.providerPaymentId).toBe('pay_abc123');
  });

  it('rejects attemptedAt before createdAt', () => {
    expect(
      () =>
        new PaymentAttempt({
          paymentAttemptId: ATTEMPT_UUID,
          paymentId: PAYMENT_UUID,
          providerPaymentId: null,
          outcome: 'INITIATED',
          providerResponseDigest: null,
          attemptedAt: NOW,
          createdAt: LATER,
        }),
    ).toThrow('attemptedAt cannot precede createdAt');
  });

  it('is frozen after construction', () => {
    const attempt = new PaymentAttempt({
      paymentAttemptId: ATTEMPT_UUID,
      paymentId: PAYMENT_UUID,
      providerPaymentId: null,
      outcome: 'SUCCESS',
      providerResponseDigest: 'sha256:abc',
      attemptedAt: NOW,
      createdAt: NOW,
    });
    expect(Object.isFrozen(attempt)).toBe(true);
  });
});

describe('PaymentRefund', () => {
  it('creates a valid refund', () => {
    const refund = new PaymentRefund({
      paymentRefundId: REFUND_UUID,
      paymentId: PAYMENT_UUID,
      amountCents: 1999,
      currency: 'INR',
      state: 'PENDING',
      providerRefundId: null,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(refund.properties.amountCents).toBe(1999);
    expect(refund.properties.state).toBe('PENDING');
  });

  it('rejects zero refund amount', () => {
    expect(
      () =>
        new PaymentRefund({
          paymentRefundId: REFUND_UUID,
          paymentId: PAYMENT_UUID,
          amountCents: 0,
          currency: 'INR',
          state: 'PENDING',
          providerRefundId: null,
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
    ).toThrow('amountCents must be greater than zero');
  });

  it('rejects invalid currency', () => {
    expect(
      () =>
        new PaymentRefund({
          paymentRefundId: REFUND_UUID,
          paymentId: PAYMENT_UUID,
          amountCents: 100,
          currency: 'IN',
          state: 'PENDING',
          providerRefundId: null,
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
    ).toThrow('ISO 4217 alpha-3');
  });

  it('isTerminalRefundState works correctly', () => {
    expect(isTerminalRefundState('REFUNDED')).toBe(true);
    expect(isTerminalRefundState('FAILED')).toBe(true);
    expect(isTerminalRefundState('PENDING')).toBe(false);
    expect(isTerminalRefundState('PROCESSING')).toBe(false);
  });
});

describe('PaymentStateTransition', () => {
  it('creates a valid transition', () => {
    const transition = new PaymentStateTransition({
      transitionId: TRANSITION_UUID,
      paymentId: PAYMENT_UUID,
      fromState: 'PENDING',
      toState: 'PROCESSING',
      stateVersion: 2,
      actorIdentityId: ACTOR_UUID,
      actorKind: 'CUSTOMER',
      reasonReference: 'customer_initiated',
      transitionedAt: NOW,
      createdAt: NOW,
    });
    expect(transition.properties.fromState).toBe('PENDING');
    expect(transition.properties.toState).toBe('PROCESSING');
  });

  it('rejects same from/to state', () => {
    expect(
      () =>
        new PaymentStateTransition({
          transitionId: TRANSITION_UUID,
          paymentId: PAYMENT_UUID,
          fromState: 'PENDING',
          toState: 'PENDING',
          stateVersion: 2,
          actorIdentityId: ACTOR_UUID,
          actorKind: 'CUSTOMER',
          reasonReference: 'test',
          transitionedAt: NOW,
          createdAt: NOW,
        }),
    ).toThrow('fromState and toState must differ');
  });
});

describe('PaymentAuditRecord', () => {
  it('creates a valid audit record', () => {
    const record = new PaymentAuditRecord({
      auditEventId: AUDIT_UUID,
      paymentId: PAYMENT_UUID,
      orderId: ORDER_UUID,
      customerProfileId: PROFILE_UUID,
      eventType: 'PAYMENT_CREATED',
      actorIdentityId: ACTOR_UUID,
      occurredAt: NOW,
      createdAt: NOW,
    });
    expect(record.properties.eventType).toBe('PAYMENT_CREATED');
  });

  it('rejects empty eventType', () => {
    expect(
      () =>
        new PaymentAuditRecord({
          auditEventId: AUDIT_UUID,
          paymentId: PAYMENT_UUID,
          orderId: ORDER_UUID,
          customerProfileId: PROFILE_UUID,
          eventType: '',
          actorIdentityId: ACTOR_UUID,
          occurredAt: NOW,
          createdAt: NOW,
        }),
    ).toThrow('eventType is required');
  });
});
