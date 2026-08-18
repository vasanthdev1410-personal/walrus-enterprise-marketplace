import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Cart } from '../entities/cart';
import { CartLifecycle } from '../lifecycle/cart-lifecycle';
import { CartDomainError } from '../errors/cart-domain.error';
import { CartId } from '../value-objects/cart-id';

const UUID1 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const UUID2 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const UUID3 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const NOW = new Date('2026-08-18T00:00:00Z');

const makeCart = (state: 'ACTIVE' | 'CHECKED_OUT' | 'ARCHIVED' | 'AUTO_EXPIRED' = 'ACTIVE'): Cart =>
  new Cart({
    cartId: new CartId(UUID1.value),
    customerProfileId: new CartId(UUID2.value),
    state,
    totalLines: 1,
    totalItems: 2,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });

const lifecycle = new CartLifecycle();

describe('CartLifecycle.transition', () => {
  describe('ACTIVE transitions', () => {
    it('should allow ACTIVE → CHECKED_OUT by CUSTOMER', () => {
      const cart = makeCart('ACTIVE');
      const transition = lifecycle.transition({
        cart,
        toState: 'CHECKED_OUT',
        actor: { identityId: UUID3, kind: 'CUSTOMER' },
        now: NOW,
        transitionId: UUID1,
        reasonReference: '',
      });
      expect(transition.properties.fromState).toBe('ACTIVE');
      expect(transition.properties.toState).toBe('CHECKED_OUT');
      expect(transition.properties.stateVersion).toBe(2);
    });

    it('should allow ACTIVE → AUTO_EXPIRED by SYSTEM', () => {
      const cart = makeCart('ACTIVE');
      const transition = lifecycle.transition({
        cart,
        toState: 'AUTO_EXPIRED',
        actor: { identityId: UUID3, kind: 'SYSTEM' },
        now: NOW,
        transitionId: UUID1,
        reasonReference: '30-day-abandonment',
      });
      expect(transition.properties.toState).toBe('AUTO_EXPIRED');
      expect(transition.properties.reasonReference).toBe('30-day-abandonment');
    });

    it('should reject ACTIVE → AUTO_EXPIRED without reason', () => {
      const cart = makeCart('ACTIVE');
      expect(() =>
        lifecycle.transition({
          cart,
          toState: 'AUTO_EXPIRED',
          actor: { identityId: UUID3, kind: 'SYSTEM' },
          now: NOW,
          transitionId: UUID1,
          reasonReference: '',
        }),
      ).toThrow(CartDomainError);
    });

    it('should reject ACTIVE → ARCHIVED (not in transition table)', () => {
      const cart = makeCart('ACTIVE');
      expect(() =>
        lifecycle.transition({
          cart,
          toState: 'ARCHIVED',
          actor: { identityId: UUID3, kind: 'SYSTEM' },
          now: NOW,
          transitionId: UUID1,
          reasonReference: '',
        }),
      ).toThrow(CartDomainError);
    });
  });

  describe('CHECKED_OUT transitions', () => {
    it('should allow CHECKED_OUT → ARCHIVED by SYSTEM', () => {
      const cart = makeCart('CHECKED_OUT');
      const transition = lifecycle.transition({
        cart,
        toState: 'ARCHIVED',
        actor: { identityId: UUID3, kind: 'SYSTEM' },
        now: NOW,
        transitionId: UUID1,
        reasonReference: 'checkout-complete',
      });
      expect(transition.properties.toState).toBe('ARCHIVED');
    });

    it('should reject CHECKED_OUT → ACTIVE (not in table)', () => {
      const cart = makeCart('CHECKED_OUT');
      expect(() =>
        lifecycle.transition({
          cart,
          toState: 'ACTIVE',
          actor: { identityId: UUID3, kind: 'SYSTEM' },
          now: NOW,
          transitionId: UUID1,
          reasonReference: '',
        }),
      ).toThrow(CartDomainError);
    });
  });

  describe('AUTO_EXPIRED transitions', () => {
    it('should allow AUTO_EXPIRED → ARCHIVED by SYSTEM', () => {
      const cart = makeCart('AUTO_EXPIRED');
      const transition = lifecycle.transition({
        cart,
        toState: 'ARCHIVED',
        actor: { identityId: UUID3, kind: 'SYSTEM' },
        now: NOW,
        transitionId: UUID1,
        reasonReference: 'archive-expired',
      });
      expect(transition.properties.toState).toBe('ARCHIVED');
    });
  });

  describe('ARCHIVED (terminal)', () => {
    it('should reject all transitions from ARCHIVED', () => {
      const cart = makeCart('ARCHIVED');
      expect(() =>
        lifecycle.transition({
          cart,
          toState: 'ACTIVE',
          actor: { identityId: UUID3, kind: 'SYSTEM' },
          now: NOW,
          transitionId: UUID1,
          reasonReference: '',
        }),
      ).toThrow(CartDomainError);
    });
  });

  describe('same-state transitions', () => {
    it('should reject ACTIVE → ACTIVE', () => {
      const cart = makeCart('ACTIVE');
      expect(() =>
        lifecycle.transition({
          cart,
          toState: 'ACTIVE',
          actor: { identityId: UUID3, kind: 'CUSTOMER' },
          now: NOW,
          transitionId: UUID1,
          reasonReference: '',
        }),
      ).toThrow(CartDomainError);
    });
  });

  describe('actor authorization', () => {
    it('should reject CUSTOMER performing AUTO_EXPIRED transition', () => {
      const cart = makeCart('ACTIVE');
      expect(() =>
        lifecycle.transition({
          cart,
          toState: 'AUTO_EXPIRED',
          actor: { identityId: UUID3, kind: 'CUSTOMER' },
          now: NOW,
          transitionId: UUID1,
          reasonReference: 'test',
        }),
      ).toThrow(CartDomainError);
    });

    it('should reject SYSTEM performing CHECKED_OUT transition', () => {
      const cart = makeCart('ACTIVE');
      expect(() =>
        lifecycle.transition({
          cart,
          toState: 'CHECKED_OUT',
          actor: { identityId: UUID3, kind: 'SYSTEM' },
          now: NOW,
          transitionId: UUID1,
          reasonReference: '',
        }),
      ).toThrow(CartDomainError);
    });
  });

  describe('expectedVersion', () => {
    it('should reject stale version', () => {
      const cart = makeCart('ACTIVE');
      expect(() =>
        lifecycle.transition({
          cart,
          toState: 'CHECKED_OUT',
          actor: { identityId: UUID3, kind: 'CUSTOMER' },
          now: NOW,
          transitionId: UUID1,
          reasonReference: '',
          expectedVersion: 99,
        }),
      ).toThrow(CartDomainError);
    });

    it('should accept matching version', () => {
      const cart = makeCart('ACTIVE');
      const transition = lifecycle.transition({
        cart,
        toState: 'CHECKED_OUT',
        actor: { identityId: UUID3, kind: 'CUSTOMER' },
        now: NOW,
        transitionId: UUID1,
        reasonReference: '',
        expectedVersion: 1,
      });
      expect(transition.properties.stateVersion).toBe(2);
    });
  });
});

describe('CartLifecycle.canTransition', () => {
  it('should return true for valid transitions', () => {
    const cart = makeCart('ACTIVE');
    expect(
      lifecycle.canTransition({
        cart,
        toState: 'CHECKED_OUT',
        actor: { identityId: UUID3, kind: 'CUSTOMER' },
        now: NOW,
        transitionId: UUID1,
        reasonReference: '',
      }),
    ).toBe(true);
  });

  it('should return false for invalid transitions', () => {
    const cart = makeCart('ACTIVE');
    expect(
      lifecycle.canTransition({
        cart,
        toState: 'ARCHIVED',
        actor: { identityId: UUID3, kind: 'CUSTOMER' },
        now: NOW,
        transitionId: UUID1,
        reasonReference: '',
      }),
    ).toBe(false);
  });

  it('should return false for terminal state transitions', () => {
    const cart = makeCart('ARCHIVED');
    expect(
      lifecycle.canTransition({
        cart,
        toState: 'ACTIVE',
        actor: { identityId: UUID3, kind: 'SYSTEM' },
        now: NOW,
        transitionId: UUID1,
        reasonReference: '',
      }),
    ).toBe(false);
  });
});

describe('CartLifecycle.updatedCart', () => {
  it('should advance version and state', () => {
    const cart = makeCart('ACTIVE');
    const updated = lifecycle.updatedCart(cart, 'CHECKED_OUT', NOW);
    expect(updated.properties.state).toBe('CHECKED_OUT');
    expect(updated.properties.aggregateVersion.value).toBe(2);
    expect(updated.properties.updatedAt).toBe(NOW);
  });

  it('should clear expiresAt on terminal states (ARCHIVED)', () => {
    const futureDate = new Date('2026-09-17');
    const cart = new Cart({
      cartId: new CartId(UUID1.value),
      customerProfileId: new CartId(UUID2.value),
      state: 'ACTIVE',
      totalLines: 0,
      totalItems: 0,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: futureDate,
    });
    const updated = lifecycle.updatedCart(cart, 'ARCHIVED', NOW);
    expect(updated.properties.expiresAt).toBeUndefined();
  });
});

describe('CartLifecycle.assertCanMutate', () => {
  it('should allow mutation on ACTIVE', () => {
    expect(() => {
      lifecycle.assertCanMutate('ACTIVE');
    }).not.toThrow();
  });

  it('should reject mutation on CHECKED_OUT', () => {
    expect(() => {
      lifecycle.assertCanMutate('CHECKED_OUT');
    }).toThrow(CartDomainError);
  });

  it('should reject mutation on ARCHIVED', () => {
    expect(() => {
      lifecycle.assertCanMutate('ARCHIVED');
    }).toThrow(CartDomainError);
  });

  it('should reject mutation on AUTO_EXPIRED', () => {
    expect(() => {
      lifecycle.assertCanMutate('AUTO_EXPIRED');
    }).toThrow(CartDomainError);
  });
});

describe('CartLifecycle.assertCanSelfRead', () => {
  it('should allow read on ACTIVE', () => {
    expect(() => {
      lifecycle.assertCanSelfRead('ACTIVE');
    }).not.toThrow();
  });

  it('should reject read on CHECKED_OUT', () => {
    expect(() => {
      lifecycle.assertCanSelfRead('CHECKED_OUT');
    }).toThrow(CartDomainError);
  });

  it('should reject read on ARCHIVED', () => {
    expect(() => {
      lifecycle.assertCanSelfRead('ARCHIVED');
    }).toThrow(CartDomainError);
  });

  it('should reject read on AUTO_EXPIRED', () => {
    expect(() => {
      lifecycle.assertCanSelfRead('AUTO_EXPIRED');
    }).toThrow(CartDomainError);
  });
});
