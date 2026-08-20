import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { PaymentId } from '../value-objects/payment-id';
import { Payment } from '../entities/payment';
import { PaymentDomainError } from '../errors/payment-domain.error';
import { PaymentLifecycle } from './payment-lifecycle';

const PAYMENT_UUID = new PaymentId('0192a1b2-c3d4-7000-8000-000000000001');
const ORDER_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const PROFILE_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const ACTOR_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const TRANSITION_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000005');
const NOW = new Date('2026-08-20T12:00:00.000Z');

function makePayment(state: string, version = 1): Payment {
  return new Payment({
    paymentId: PAYMENT_UUID,
    orderId: ORDER_UUID,
    customerProfileId: PROFILE_UUID,
    state: state as never,
    amountCents: 1999,
    currency: 'INR',
    provider: 'razorpay',
    providerOrderId: null,
    providerPaymentId: null,
    idempotencyKey: 'idem-001',
    aggregateVersion: new AggregateVersion(version),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

const lifecycle = new PaymentLifecycle();

describe('PaymentLifecycle', () => {
  // ---- PENDING transitions ----

  describe('PENDING → PROCESSING', () => {
    it('allows CUSTOMER actor', () => {
      const payment = makePayment('PENDING');
      const transition = lifecycle.transition({
        payment,
        toState: 'PROCESSING',
        actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
        now: NOW,
        transitionId: TRANSITION_UUID,
        reasonReference: 'customer_initiated',
      });
      expect(transition.properties.fromState).toBe('PENDING');
      expect(transition.properties.toState).toBe('PROCESSING');
    });

    it('rejects SYSTEM actor', () => {
      const payment = makePayment('PENDING');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'PROCESSING',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(PaymentDomainError);
    });

    it('canTransition returns true for valid transition', () => {
      const payment = makePayment('PENDING');
      expect(
        lifecycle.canTransition({
          payment,
          toState: 'PROCESSING',
          actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toBe(true);
    });
  });

  describe('PENDING → EXPIRED', () => {
    it('allows SYSTEM actor', () => {
      const payment = makePayment('PENDING');
      const transition = lifecycle.transition({
        payment,
        toState: 'EXPIRED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: NOW,
        transitionId: TRANSITION_UUID,
        reasonReference: 'timeout',
      });
      expect(transition.properties.toState).toBe('EXPIRED');
    });

    it('rejects CUSTOMER actor', () => {
      const payment = makePayment('PENDING');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'EXPIRED',
          actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(PaymentDomainError);
    });
  });

  // ---- PROCESSING transitions ----

  describe('PROCESSING → CAPTURED', () => {
    it('allows SYSTEM actor', () => {
      const payment = makePayment('PROCESSING');
      const transition = lifecycle.transition({
        payment,
        toState: 'CAPTURED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: NOW,
        transitionId: TRANSITION_UUID,
        reasonReference: 'webhook_payment_captured',
      });
      expect(transition.properties.toState).toBe('CAPTURED');
    });
  });

  describe('PROCESSING → FAILED', () => {
    it('allows SYSTEM actor', () => {
      const payment = makePayment('PROCESSING');
      const transition = lifecycle.transition({
        payment,
        toState: 'FAILED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: NOW,
        transitionId: TRANSITION_UUID,
        reasonReference: 'webhook_payment_failed',
      });
      expect(transition.properties.toState).toBe('FAILED');
    });
  });

  // ---- CAPTURED transitions ----

  describe('CAPTURED → REFUND_PENDING', () => {
    it('allows ADMIN actor with reason', () => {
      const payment = makePayment('CAPTURED');
      const transition = lifecycle.transition({
        payment,
        toState: 'REFUND_PENDING',
        actor: { identityId: ACTOR_UUID, kind: 'ADMIN' },
        now: NOW,
        transitionId: TRANSITION_UUID,
        reasonReference: 'customer_refund_request',
      });
      expect(transition.properties.toState).toBe('REFUND_PENDING');
    });

    it('rejects ADMIN without reason', () => {
      const payment = makePayment('CAPTURED');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'REFUND_PENDING',
          actor: { identityId: ACTOR_UUID, kind: 'ADMIN' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(PaymentDomainError);
    });

    it('rejects CUSTOMER actor', () => {
      const payment = makePayment('CAPTURED');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'REFUND_PENDING',
          actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: 'refund',
        }),
      ).toThrow(PaymentDomainError);
    });
  });

  // ---- REFUND_PENDING transitions ----

  describe('REFUND_PENDING → REFUNDED', () => {
    it('allows SYSTEM actor', () => {
      const payment = makePayment('REFUND_PENDING');
      const transition = lifecycle.transition({
        payment,
        toState: 'REFUNDED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: NOW,
        transitionId: TRANSITION_UUID,
        reasonReference: 'webhook_refund_created',
      });
      expect(transition.properties.toState).toBe('REFUNDED');
    });
  });

  describe('REFUND_PENDING → FAILED', () => {
    it('allows SYSTEM actor', () => {
      const payment = makePayment('REFUND_PENDING');
      const transition = lifecycle.transition({
        payment,
        toState: 'FAILED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: NOW,
        transitionId: TRANSITION_UUID,
        reasonReference: 'webhook_refund_failed',
      });
      expect(transition.properties.toState).toBe('FAILED');
    });
  });

  // ---- Terminal state enforcement ----

  describe('terminal state enforcement', () => {
    it('rejects transitions from FAILED (terminal)', () => {
      const payment = makePayment('FAILED');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'PROCESSING',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: 'test',
        }),
      ).toThrow(PaymentDomainError);
    });

    it('rejects transitions from EXPIRED (terminal)', () => {
      const payment = makePayment('EXPIRED');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'PENDING',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: 'test',
        }),
      ).toThrow(PaymentDomainError);
    });

    it('rejects transitions from REFUNDED (terminal)', () => {
      const payment = makePayment('REFUNDED');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'PENDING',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: 'test',
        }),
      ).toThrow(PaymentDomainError);
    });
  });

  // ---- Version guard ----

  describe('version guard', () => {
    it('rejects stale version', () => {
      const payment = makePayment('PENDING', 2);
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'PROCESSING',
          actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: '',
          expectedVersion: 1,
        }),
      ).toThrow(PaymentDomainError);
    });

    it('accepts correct version', () => {
      const payment = makePayment('PENDING', 3);
      const transition = lifecycle.transition({
        payment,
        toState: 'PROCESSING',
        actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
        now: NOW,
        transitionId: TRANSITION_UUID,
        reasonReference: '',
        expectedVersion: 3,
      });
      expect(transition.properties.stateVersion).toBe(4);
    });
  });

  // ---- Same-state rejection ----

  describe('same-state rejection', () => {
    it('rejects same-state transition', () => {
      const payment = makePayment('PENDING');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'PENDING',
          actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(PaymentDomainError);
    });
  });

  // ---- Invalid transitions ----

  describe('invalid transitions', () => {
    it('rejects PENDING → CAPTURED', () => {
      const payment = makePayment('PENDING');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'CAPTURED',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(PaymentDomainError);
    });

    it('rejects PROCESSING → REFUND_PENDING', () => {
      const payment = makePayment('PROCESSING');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'REFUND_PENDING',
          actor: { identityId: ACTOR_UUID, kind: 'ADMIN' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: 'test',
        }),
      ).toThrow(PaymentDomainError);
    });

    it('rejects PENDING → REFUNDED', () => {
      const payment = makePayment('PENDING');
      expect(() =>
        lifecycle.transition({
          payment,
          toState: 'REFUNDED',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(PaymentDomainError);
    });
  });

  // ---- updatedPayment ----

  describe('updatedPayment', () => {
    it('returns payment with new state, incremented version, and updated timestamp', () => {
      const payment = makePayment('PENDING', 1);
      const newTime = new Date('2026-08-20T13:00:00.000Z');
      const updated = lifecycle.updatedPayment(payment, 'PROCESSING', newTime);
      expect(updated.properties.state).toBe('PROCESSING');
      expect(updated.properties.aggregateVersion.value).toBe(2);
      expect(updated.properties.updatedAt).toBe(newTime);
      expect(updated.properties.paymentId).toBe(PAYMENT_UUID);
      expect(updated.properties.amountCents).toBe(1999);
    });

    it('preserves immutable fields', () => {
      const payment = makePayment('PENDING');
      const updated = lifecycle.updatedPayment(payment, 'PROCESSING', NOW);
      expect(updated.properties.orderId).toBe(ORDER_UUID);
      expect(updated.properties.customerProfileId).toBe(PROFILE_UUID);
      expect(updated.properties.amountCents).toBe(1999);
      expect(updated.properties.currency).toBe('INR');
      expect(updated.properties.provider).toBe('razorpay');
      expect(updated.properties.idempotencyKey).toBe('idem-001');
    });
  });

  // ---- canTransition ----

  describe('canTransition', () => {
    it('returns false for invalid transitions', () => {
      const payment = makePayment('PENDING');
      expect(
        lifecycle.canTransition({
          payment,
          toState: 'CAPTURED',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toBe(false);
    });

    it('returns false for terminal states', () => {
      const payment = makePayment('FAILED');
      expect(
        lifecycle.canTransition({
          payment,
          toState: 'PENDING',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: NOW,
          transitionId: TRANSITION_UUID,
          reasonReference: 'test',
        }),
      ).toBe(false);
    });
  });
});
