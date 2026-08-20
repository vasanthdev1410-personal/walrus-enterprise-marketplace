import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Payment } from '../../../../domain/entities/payment';
import { PaymentAuditRecord } from '../../../../domain/entities/payment-audit-record';
import { PaymentAttempt } from '../../../../domain/entities/payment-attempt';
import { PaymentRefund } from '../../../../domain/entities/payment-refund';
import { PaymentStateTransition } from '../../../../domain/entities/payment-state-transition';
import { PaymentId } from '../../../../domain/value-objects/payment-id';
import { PaymentRefundId } from '../../../../domain/value-objects/payment-refund-id';
import type { PaymentState } from '../../../../domain/value-objects/payment-state';
import type { RefundState } from '../../../../domain/entities/payment-refund';
import type { PaymentAttemptOutcome } from '../../../../domain/entities/payment-attempt';
import {
  paymentAuditRecordMapper,
  paymentAttemptMapper,
  paymentMapper,
  paymentRefundMapper,
  paymentStateTransitionMapper,
} from './payment.mapper';

const UUID1 = new UuidV7('0192a000-0001-7000-8000-000000000001');
const UUID2 = new UuidV7('0192a000-0002-7000-8000-000000000002');
const UUID3 = new UuidV7('0192a000-0003-7000-8000-000000000003');
const UUID4 = new UuidV7('0192a000-0004-7000-8000-000000000004');
const UUID5 = new UuidV7('0192a000-0005-7000-8000-000000000005');
const UUID6 = new UuidV7('0192a000-0006-7000-8000-000000000006');
const NOW = new Date('2026-08-20T10:00:00.000Z');

describe('paymentMapper', () => {
  it('should map Payment domain to Prisma persistence shape', () => {
    const payment = new Payment({
      paymentId: new PaymentId(UUID1.value),
      orderId: UUID2,
      customerProfileId: UUID3,
      state: 'PENDING',
      amountCents: 1000,
      currency: 'INR',
      provider: 'razorpay',
      providerOrderId: null,
      providerPaymentId: null,
      idempotencyKey: 'idem-key-001',
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });

    const persistence = paymentMapper.toPersistence(payment);
    expect(persistence.paymentId).toBe(UUID1.value);
    expect(persistence.orderId).toBe(UUID2.value);
    expect(persistence.customerProfileId).toBe(UUID3.value);
    expect(persistence.state).toBe('PENDING');
    expect(persistence.amountCents).toBe(1000);
    expect(persistence.currency).toBe('INR');
    expect(persistence.provider).toBe('razorpay');
    expect(persistence.idempotencyKey).toBe('idem-key-001');
    expect(persistence.aggregateVersion).toBe(1);
  });

  it('should map Prisma row to Payment domain', () => {
    const row = {
      paymentId: UUID1.value,
      orderId: UUID2.value,
      customerProfileId: UUID3.value,
      state: 'PENDING' as PaymentState,
      amountCents: 2000,
      currency: 'INR',
      provider: 'razorpay',
      providerOrderId: null,
      providerPaymentId: null,
      idempotencyKey: 'idem-key-002',
      aggregateVersion: 2,
      createdAt: NOW,
      updatedAt: NOW,
      correlationId: null,
    };

    const payment = paymentMapper.toDomain(row);
    expect(payment.properties.paymentId.value).toBe(UUID1.value);
    expect(payment.properties.state).toBe('PENDING');
    expect(payment.properties.amountCents).toBe(2000);
    expect(payment.properties.correlationId).toBeUndefined();
  });

  it('should map correlationId when present', () => {
    const row = {
      paymentId: UUID1.value,
      orderId: UUID2.value,
      customerProfileId: UUID3.value,
      state: 'PROCESSING' as PaymentState,
      amountCents: 500,
      currency: 'INR',
      provider: 'razorpay',
      providerOrderId: 'order_rzp_001',
      providerPaymentId: null,
      idempotencyKey: 'idem-key-003',
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      correlationId: UUID4.value,
    };

    const payment = paymentMapper.toDomain(row);
    expect(payment.properties.correlationId).toBeDefined();
    expect(payment.properties.correlationId?.value).toBe(UUID4.value);
    expect(payment.properties.providerOrderId).toBe('order_rzp_001');
  });
});

describe('paymentAttemptMapper', () => {
  it('should map PaymentAttempt domain to Prisma persistence shape', () => {
    const attempt = new PaymentAttempt({
      paymentAttemptId: new PaymentId(UUID1.value),
      paymentId: UUID2,
      providerPaymentId: 'pay_razor_001',
      outcome: 'INITIATED',
      providerResponseDigest: null,
      attemptedAt: NOW,
      createdAt: NOW,
    });

    const persistence = paymentAttemptMapper.toPersistence(attempt);
    expect(persistence.paymentAttemptId).toBe(UUID1.value);
    expect(persistence.paymentId).toBe(UUID2.value);
    expect(persistence.outcome).toBe('INITIATED');
    expect(persistence.providerPaymentId).toBe('pay_razor_001');
  });

  it('should map Prisma row to PaymentAttempt domain', () => {
    const row = {
      paymentAttemptId: UUID1.value,
      paymentId: UUID2.value,
      providerPaymentId: 'pay_razor_002',
      outcome: 'SUCCESS' as PaymentAttemptOutcome,
      providerResponseDigest: 'sha256_digest',
      attemptedAt: NOW,
      createdAt: NOW,
    };

    const attempt = paymentAttemptMapper.toDomain(row);
    expect(attempt.properties.outcome).toBe('SUCCESS');
    expect(attempt.properties.providerPaymentId).toBe('pay_razor_002');
    expect(attempt.properties.providerResponseDigest).toBe('sha256_digest');
  });
});

describe('paymentRefundMapper', () => {
  it('should map PaymentRefund domain to Prisma persistence shape', () => {
    const refund = new PaymentRefund({
      paymentRefundId: new PaymentRefundId(UUID1.value),
      paymentId: UUID2,
      amountCents: 500,
      currency: 'INR',
      state: 'PENDING',
      providerRefundId: null,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });

    const persistence = paymentRefundMapper.toPersistence(refund);
    expect(persistence.paymentRefundId).toBe(UUID1.value);
    expect(persistence.paymentId).toBe(UUID2.value);
    expect(persistence.amountCents).toBe(500);
    expect(persistence.state).toBe('PENDING');
  });

  it('should map Prisma row to PaymentRefund domain', () => {
    const row = {
      paymentRefundId: UUID1.value,
      paymentId: UUID2.value,
      amountCents: 300,
      currency: 'INR',
      state: 'REFUNDED' as RefundState,
      providerRefundId: 'rfnd_001',
      aggregateVersion: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const refund = paymentRefundMapper.toDomain(row);
    expect(refund.properties.state).toBe('REFUNDED');
    expect(refund.properties.amountCents).toBe(300);
    expect(refund.properties.providerRefundId).toBe('rfnd_001');
  });
});

describe('paymentStateTransitionMapper', () => {
  it('should map PaymentStateTransition domain to Prisma persistence shape', () => {
    const transition = new PaymentStateTransition({
      transitionId: new UuidV7(UUID1.value),
      paymentId: UUID2,
      fromState: 'PENDING',
      toState: 'PROCESSING',
      stateVersion: 1,
      actorIdentityId: UUID3,
      actorKind: 'CUSTOMER',
      reasonReference: 'customer_initiated',
      correlationId: new CorrelationIdentifier(UUID4.value),
      transitionedAt: NOW,
      createdAt: NOW,
    });

    const persistence = paymentStateTransitionMapper.toPersistence(transition);
    expect(persistence.paymentId).toBe(UUID2.value);
    expect(persistence.fromState).toBe('PENDING');
    expect(persistence.toState).toBe('PROCESSING');
    expect(persistence.stateVersion).toBe(1);
    expect(persistence.actorKind).toBe('CUSTOMER');
    expect(persistence.correlationId).toBe(UUID4.value);
  });

  it('should map Prisma row to PaymentStateTransition domain', () => {
    const row = {
      transitionId: UUID1.value,
      paymentId: UUID2.value,
      fromState: 'PROCESSING' as PaymentState,
      toState: 'CAPTURED' as PaymentState,
      stateVersion: 2,
      actorIdentityId: UUID3.value,
      actorKind: 'SYSTEM',
      reasonReference: 'webhook_confirmed',
      correlationId: null,
      causationId: null,
      sourceReference: null,
      transitionedAt: NOW,
      createdAt: NOW,
    };

    const transition = paymentStateTransitionMapper.toDomain(row);
    expect(transition.properties.fromState).toBe('PROCESSING');
    expect(transition.properties.toState).toBe('CAPTURED');
    expect(transition.properties.correlationId).toBeUndefined();
  });
});

describe('paymentAuditRecordMapper', () => {
  it('should map PaymentAuditRecord domain to Prisma persistence shape', () => {
    const audit = new PaymentAuditRecord({
      auditEventId: new UuidV7(UUID1.value),
      paymentId: UUID2,
      orderId: UUID3,
      customerProfileId: UUID4,
      eventType: 'PAYMENT_CREATED',
      actorIdentityId: UUID5,
      correlationId: new CorrelationIdentifier(UUID6.value),
      occurredAt: NOW,
      createdAt: NOW,
    });

    const persistence = paymentAuditRecordMapper.toPersistence(audit);
    expect(persistence.paymentId).toBe(UUID2.value);
    expect(persistence.orderId).toBe(UUID3.value);
    expect(persistence.eventType).toBe('PAYMENT_CREATED');
    expect(persistence.correlationId).toBe(UUID6.value);
  });

  it('should map Prisma row to PaymentAuditRecord domain', () => {
    const row = {
      auditEventId: UUID1.value,
      paymentId: UUID2.value,
      orderId: UUID3.value,
      customerProfileId: UUID4.value,
      eventType: 'PAYMENT_CAPTURED',
      actorIdentityId: UUID5.value,
      correlationId: null,
      evidenceDigest: null,
      occurredAt: NOW,
      createdAt: NOW,
    };

    const audit = paymentAuditRecordMapper.toDomain(row);
    expect(audit.properties.eventType).toBe('PAYMENT_CAPTURED');
    expect(audit.properties.correlationId).toBeUndefined();
  });
});
