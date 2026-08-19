import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Order } from '../entities/order';
import { OrderDomainError } from '../errors/order-domain.error';
import { OrderLifecycle } from './order-lifecycle';
import type { OrderState } from '../value-objects/order-state';

const ORDER_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const PROFILE_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const SNAPSHOT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const CART_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const ACTOR_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000010');
const TRANSITION_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000020');

function makeNow(): Date {
  return new Date('2026-08-19T12:00:00.000Z');
}

function createOrder(state: OrderState, version = 1): Order {
  return new Order({
    orderId: ORDER_UUID,
    customerProfileId: PROFILE_UUID,
    snapshotId: SNAPSHOT_UUID,
    cartId: CART_UUID,
    state,
    totalLines: 1,
    totalItems: 3,
    subtotalAmountCents: 5997,
    subtotalCurrency: 'USD',
    aggregateVersion: new AggregateVersion(version),
    createdAt: makeNow(),
    updatedAt: makeNow(),
  });
}

describe('OrderLifecycle', () => {
  const lifecycle = new OrderLifecycle();

  describe('PENDING transitions', () => {
    it('allows PENDING → CONFIRMED by SYSTEM', () => {
      const order = createOrder('PENDING');
      const transition = lifecycle.transition({
        order,
        toState: 'CONFIRMED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: 'payment_initiated',
      });
      expect(transition.properties.fromState).toBe('PENDING');
      expect(transition.properties.toState).toBe('CONFIRMED');
    });

    it('allows PENDING → CONFIRMED by ADMIN', () => {
      const order = createOrder('PENDING');
      const transition = lifecycle.transition({
        order,
        toState: 'CONFIRMED',
        actor: { identityId: ACTOR_UUID, kind: 'ADMIN' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: '',
      });
      expect(transition.properties.toState).toBe('CONFIRMED');
    });

    it('allows PENDING → CANCELLED by CUSTOMER', () => {
      const order = createOrder('PENDING');
      const transition = lifecycle.transition({
        order,
        toState: 'CANCELLED',
        actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: 'customer_cancelled',
      });
      expect(transition.properties.toState).toBe('CANCELLED');
    });

    it('allows PENDING → CANCELLED by ADMIN', () => {
      const order = createOrder('PENDING');
      const transition = lifecycle.transition({
        order,
        toState: 'CANCELLED',
        actor: { identityId: ACTOR_UUID, kind: 'ADMIN' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: 'admin_cancelled',
      });
      expect(transition.properties.toState).toBe('CANCELLED');
    });

    it('rejects PENDING → CANCELLED without reason', () => {
      const order = createOrder('PENDING');
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'CANCELLED',
          actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(OrderDomainError);
    });

    it('rejects PENDING → CANCELLED by SYSTEM', () => {
      const order = createOrder('PENDING');
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'CANCELLED',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: 'timeout',
        }),
      ).toThrow(OrderDomainError);
    });

    it('rejects PENDING → PAID (skip CONFIRMED)', () => {
      const order = createOrder('PENDING');
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'PAID',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(OrderDomainError);
    });
  });

  describe('CONFIRMED transitions', () => {
    it('allows CONFIRMED → PAID by SYSTEM', () => {
      const order = createOrder('CONFIRMED');
      const transition = lifecycle.transition({
        order,
        toState: 'PAID',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: '',
      });
      expect(transition.properties.toState).toBe('PAID');
    });

    it('allows CONFIRMED → CANCELLED by ADMIN', () => {
      const order = createOrder('CONFIRMED');
      const transition = lifecycle.transition({
        order,
        toState: 'CANCELLED',
        actor: { identityId: ACTOR_UUID, kind: 'ADMIN' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: 'admin_cancelled',
      });
      expect(transition.properties.toState).toBe('CANCELLED');
    });

    it('rejects CONFIRMED → CANCELLED by CUSTOMER', () => {
      const order = createOrder('CONFIRMED');
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'CANCELLED',
          actor: { identityId: ACTOR_UUID, kind: 'CUSTOMER' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: 'customer_request',
        }),
      ).toThrow(OrderDomainError);
    });
  });

  describe('PAID transitions', () => {
    it('allows PAID → SHIPPED by SYSTEM', () => {
      const order = createOrder('PAID');
      const transition = lifecycle.transition({
        order,
        toState: 'SHIPPED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: '',
      });
      expect(transition.properties.toState).toBe('SHIPPED');
    });

    it('rejects PAID → DELIVERED (skip SHIPPED)', () => {
      const order = createOrder('PAID');
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'DELIVERED',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(OrderDomainError);
    });
  });

  describe('SHIPPED transitions', () => {
    it('allows SHIPPED → DELIVERED by SYSTEM', () => {
      const order = createOrder('SHIPPED');
      const transition = lifecycle.transition({
        order,
        toState: 'DELIVERED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: '',
      });
      expect(transition.properties.toState).toBe('DELIVERED');
    });
  });

  describe('DELIVERED transitions', () => {
    it('allows DELIVERED → CLOSED by SYSTEM', () => {
      const order = createOrder('DELIVERED');
      const transition = lifecycle.transition({
        order,
        toState: 'CLOSED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: '',
      });
      expect(transition.properties.toState).toBe('CLOSED');
    });

    it('rejects DELIVERED → CANCELLED (terminal)', () => {
      const order = createOrder('DELIVERED');
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'CANCELLED',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(OrderDomainError);
    });
  });

  describe('terminal states', () => {
    it('rejects CANCELLED → any transition', () => {
      const order = createOrder('CANCELLED');
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'PENDING',
          actor: { identityId: ACTOR_UUID, kind: 'ADMIN' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(OrderDomainError);
    });

    it('rejects CLOSED → any transition', () => {
      const order = createOrder('CLOSED');
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'DELIVERED',
          actor: { identityId: ACTOR_UUID, kind: 'ADMIN' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(OrderDomainError);
    });
  });

  describe('version guard', () => {
    it('rejects stale version', () => {
      const order = createOrder('PENDING', 3);
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'CONFIRMED',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
          expectedVersion: 2,
        }),
      ).toThrow(OrderDomainError);
    });

    it('accepts correct version', () => {
      const order = createOrder('PENDING', 3);
      const transition = lifecycle.transition({
        order,
        toState: 'CONFIRMED',
        actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
        now: makeNow(),
        transitionId: TRANSITION_UUID,
        reasonReference: '',
        expectedVersion: 3,
      });
      expect(transition.properties.stateVersion).toBe(4);
    });
  });

  describe('same-state rejection', () => {
    it('rejects PENDING → PENDING', () => {
      const order = createOrder('PENDING');
      expect(() =>
        lifecycle.transition({
          order,
          toState: 'PENDING',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toThrow(OrderDomainError);
    });
  });

  describe('canTransition', () => {
    it('returns true for valid transitions', () => {
      const order = createOrder('PENDING');
      expect(
        lifecycle.canTransition({
          order,
          toState: 'CONFIRMED',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      const order = createOrder('PENDING');
      expect(
        lifecycle.canTransition({
          order,
          toState: 'PAID',
          actor: { identityId: ACTOR_UUID, kind: 'SYSTEM' },
          now: makeNow(),
          transitionId: TRANSITION_UUID,
          reasonReference: '',
        }),
      ).toBe(false);
    });
  });

  describe('updatedOrder', () => {
    it('returns order with advanced version and new state', () => {
      const order = createOrder('PENDING', 1);
      const updated = lifecycle.updatedOrder(order, 'CONFIRMED', makeNow());
      expect(updated.properties.state).toBe('CONFIRMED');
      expect(updated.properties.aggregateVersion.value).toBe(2);
    });
  });

  describe('assertCanMutate', () => {
    it('allows mutation for PENDING', () => {
      expect(() => {
        lifecycle.assertCanMutate('PENDING');
      }).not.toThrow();
    });

    it('rejects mutation for CONFIRMED', () => {
      expect(() => {
        lifecycle.assertCanMutate('CONFIRMED');
      }).toThrow(OrderDomainError);
    });
  });

  describe('assertCanSelfRead', () => {
    it('allows read for PENDING', () => {
      expect(() => {
        lifecycle.assertCanSelfRead('PENDING');
      }).not.toThrow();
    });

    it('allows read for SHIPPED', () => {
      expect(() => {
        lifecycle.assertCanSelfRead('SHIPPED');
      }).not.toThrow();
    });

    it('rejects read for DELIVERED', () => {
      expect(() => {
        lifecycle.assertCanSelfRead('DELIVERED');
      }).toThrow(OrderDomainError);
    });

    it('rejects read for CANCELLED', () => {
      expect(() => {
        lifecycle.assertCanSelfRead('CANCELLED');
      }).toThrow(OrderDomainError);
    });
  });
});
