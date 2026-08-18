import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CartStateTransition } from '../entities/cart-state-transition';
import { CartAuditRecord } from '../entities/cart-audit-record';

const UUID1 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const UUID2 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const NOW = new Date('2026-08-18T00:00:00Z');

describe('CartStateTransition', () => {
  it('should create a valid transition', () => {
    const t = new CartStateTransition({
      transitionId: UUID1,
      cartId: UUID1,
      fromState: 'ACTIVE',
      toState: 'CHECKED_OUT',
      stateVersion: 2,
      actorIdentityId: UUID2,
      actorKind: 'CUSTOMER',
      transitionedAt: NOW,
      createdAt: NOW,
      reasonReference: 'checkout',
    });
    expect(t.properties.fromState).toBe('ACTIVE');
    expect(t.properties.toState).toBe('CHECKED_OUT');
    expect(t.properties.stateVersion).toBe(2);
  });

  it('should reject same-state transition', () => {
    expect(
      () =>
        new CartStateTransition({
          transitionId: UUID1,
          cartId: UUID1,
          fromState: 'ACTIVE',
          toState: 'ACTIVE',
          stateVersion: 2,
          actorIdentityId: UUID2,
          actorKind: 'CUSTOMER',
          transitionedAt: NOW,
          createdAt: NOW,
          reasonReference: 'test',
        }),
    ).toThrow('must change state');
  });

  it('should reject non-positive state version', () => {
    expect(
      () =>
        new CartStateTransition({
          transitionId: UUID1,
          cartId: UUID1,
          fromState: 'ACTIVE',
          toState: 'CHECKED_OUT',
          stateVersion: 0,
          actorIdentityId: UUID2,
          actorKind: 'CUSTOMER',
          transitionedAt: NOW,
          createdAt: NOW,
          reasonReference: 'test',
        }),
    ).toThrow('positive safe integer');
  });

  it('should reject empty actor kind', () => {
    expect(
      () =>
        new CartStateTransition({
          transitionId: UUID1,
          cartId: UUID1,
          fromState: 'ACTIVE',
          toState: 'CHECKED_OUT',
          stateVersion: 2,
          actorIdentityId: UUID2,
          actorKind: '  ',
          transitionedAt: NOW,
          createdAt: NOW,
          reasonReference: 'test',
        }),
    ).toThrow('actor kind');
  });

  it('should accept empty reason reference (enforced by lifecycle, not entity)', () => {
    const t = new CartStateTransition({
      transitionId: UUID1,
      cartId: UUID1,
      fromState: 'ACTIVE',
      toState: 'CHECKED_OUT',
      stateVersion: 2,
      actorIdentityId: UUID2,
      actorKind: 'CUSTOMER',
      transitionedAt: NOW,
      createdAt: NOW,
      reasonReference: '',
    });
    expect(t.properties.reasonReference).toBe('');
  });

  it('should reject createdAt before transitionedAt', () => {
    expect(
      () =>
        new CartStateTransition({
          transitionId: UUID1,
          cartId: UUID1,
          fromState: 'ACTIVE',
          toState: 'CHECKED_OUT',
          stateVersion: 2,
          actorIdentityId: UUID2,
          actorKind: 'CUSTOMER',
          transitionedAt: new Date('2026-08-19'),
          createdAt: NOW,
          reasonReference: '',
        }),
    ).toThrow('createdAt cannot precede transitionedAt');
  });

  it('should freeze properties', () => {
    const t = new CartStateTransition({
      transitionId: UUID1,
      cartId: UUID1,
      fromState: 'ACTIVE',
      toState: 'CHECKED_OUT',
      stateVersion: 2,
      actorIdentityId: UUID2,
      actorKind: 'CUSTOMER',
      transitionedAt: NOW,
      createdAt: NOW,
      reasonReference: '',
    });
    expect(() => {
      (t.properties as Record<string, unknown>).toState = 'ARCHIVED';
    }).toThrow();
  });
});

describe('CartAuditRecord', () => {
  it('should create a valid audit record', () => {
    const r = new CartAuditRecord({
      auditEventId: UUID1,
      cartId: UUID1,
      customerProfileId: UUID2,
      eventType: 'CART_ITEM_ADDED',
      actorIdentityId: UUID2,
      occurredAt: NOW,
      createdAt: NOW,
    });
    expect(r.properties.eventType).toBe('CART_ITEM_ADDED');
  });

  it('should reject empty event type', () => {
    expect(
      () =>
        new CartAuditRecord({
          auditEventId: UUID1,
          cartId: UUID1,
          customerProfileId: UUID2,
          eventType: '  ',
          actorIdentityId: UUID2,
          occurredAt: NOW,
          createdAt: NOW,
        }),
    ).toThrow('event type is required');
  });

  it('should reject invalid evidence digest', () => {
    expect(
      () =>
        new CartAuditRecord({
          auditEventId: UUID1,
          cartId: UUID1,
          customerProfileId: UUID2,
          eventType: 'CART_CREATED',
          actorIdentityId: UUID2,
          occurredAt: NOW,
          createdAt: NOW,
          evidenceDigest: 'not-a-sha256',
        }),
    ).toThrow('SHA-256 hex digest');
  });

  it('should accept valid SHA-256 digest', () => {
    const digest = 'a'.repeat(64);
    const r = new CartAuditRecord({
      auditEventId: UUID1,
      cartId: UUID1,
      customerProfileId: UUID2,
      eventType: 'CART_CREATED',
      actorIdentityId: UUID2,
      occurredAt: NOW,
      createdAt: NOW,
      evidenceDigest: digest,
    });
    expect(r.properties.evidenceDigest).toBe(digest);
  });

  it('should reject createdAt before occurredAt', () => {
    expect(
      () =>
        new CartAuditRecord({
          auditEventId: UUID1,
          cartId: UUID1,
          customerProfileId: UUID2,
          eventType: 'CART_CREATED',
          actorIdentityId: UUID2,
          occurredAt: new Date('2026-08-19'),
          createdAt: NOW,
        }),
    ).toThrow('createdAt cannot precede occurredAt');
  });

  it('should freeze properties', () => {
    const r = new CartAuditRecord({
      auditEventId: UUID1,
      cartId: UUID1,
      customerProfileId: UUID2,
      eventType: 'CART_CREATED',
      actorIdentityId: UUID2,
      occurredAt: NOW,
      createdAt: NOW,
    });
    expect(() => {
      (r.properties as Record<string, unknown>).eventType = 'CHANGED';
    }).toThrow();
  });
});
