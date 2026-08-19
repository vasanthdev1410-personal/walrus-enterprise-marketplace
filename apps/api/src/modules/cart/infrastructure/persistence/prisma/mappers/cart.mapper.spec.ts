import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Cart } from '../../../../domain/entities/cart';
import { CartAuditRecord } from '../../../../domain/entities/cart-audit-record';
import { CartLine } from '../../../../domain/entities/cart-line';
import { CartStateTransition } from '../../../../domain/entities/cart-state-transition';
import { CartId } from '../../../../domain/value-objects/cart-id';
import { CartLineId } from '../../../../domain/value-objects/cart-line-id';
import { MoneyAmount } from '../../../../domain/value-objects/money-amount';
import { Quantity } from '../../../../domain/value-objects/quantity';
import type { CartState } from '../../../../domain/value-objects/cart-state';
import {
  cartAuditRecordMapper,
  cartLineMapper,
  cartMapper,
  cartStateTransitionMapper,
} from './cart.mapper';

const UUID1 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const UUID2 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const UUID3 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const UUID4 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const NOW = new Date('2026-08-18T00:00:00.000Z');

describe('cartMapper', () => {
  it('should round-trip Cart domain → Prisma → domain', () => {
    const cart = new Cart({
      cartId: new CartId(UUID1.value),
      customerProfileId: new CartId(UUID2.value),
      state: 'ACTIVE',
      totalLines: 2,
      totalItems: 5,
      aggregateVersion: new AggregateVersion(3),
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: new Date('2026-09-17'),
    });

    const persistence = cartMapper.toPersistence(cart);
    expect(persistence.cartId).toBe(UUID1.value);
    expect(persistence.customerProfileId).toBe(UUID2.value);
    expect(persistence.state).toBe('ACTIVE');
    expect(persistence.totalLines).toBe(2);
    expect(persistence.totalItems).toBe(5);
    expect(persistence.aggregateVersion).toBe(3);
  });

  it('should map Prisma row to Cart domain', () => {
    const row = {
      cartId: UUID1.value,
      customerProfileId: UUID2.value,
      state: 'ACTIVE' as CartState,
      totalLines: 1,
      totalItems: 2,
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: null,
      correlationId: null,
    };

    const cart = cartMapper.toDomain(row);
    expect(cart.properties.cartId.value).toBe(UUID1.value);
    expect(cart.properties.state).toBe('ACTIVE');
    expect(cart.properties.totalLines).toBe(1);
    expect(cart.properties.expiresAt).toBeUndefined();
  });
});

describe('cartLineMapper', () => {
  it('should round-trip CartLine domain → Prisma → domain', () => {
    const line = new CartLine({
      cartLineId: new CartLineId(UUID1.value),
      cartId: new CartId(UUID2.value),
      skuId: UUID3,
      productId: UUID4,
      skuCode: 'SKU-001',
      quantity: new Quantity(3),
      unitPrice: new MoneyAmount(1999, 'USD'),
      snapshotTaxIncluded: true,
      productUnavailable: false,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });

    const persistence = cartLineMapper.toPersistence(line);
    expect(persistence.cartLineId).toBe(UUID1.value);
    expect(persistence.skuId).toBe(UUID3.value);
    expect(persistence.productId).toBe(UUID4.value);
    expect(persistence.quantity).toBe(3);
    expect(persistence.unitPriceAmount).toBe(1999);
    expect(persistence.unitPriceCurrency).toBe('USD');
    expect(persistence.snapshotTaxIncluded).toBe(true);
    expect(persistence.productUnavailable).toBe(false);
  });

  it('should map Prisma row to CartLine domain', () => {
    const row = {
      cartLineId: UUID1.value,
      cartId: UUID2.value,
      skuId: UUID3.value,
      productId: UUID4.value,
      skuCode: 'SKU-001',
      quantity: 5,
      unitPriceAmount: 2500,
      unitPriceCurrency: 'EUR',
      snapshotTaxIncluded: false,
      productUnavailable: true,
      aggregateVersion: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const line = cartLineMapper.toDomain(row);
    expect(line.properties.skuCode).toBe('SKU-001');
    expect(line.properties.quantity.value).toBe(5);
    expect(line.properties.unitPrice.cents).toBe(2500);
    expect(line.properties.unitPrice.currencyCode).toBe('EUR');
    expect(line.properties.productUnavailable).toBe(true);
  });
});

describe('cartStateTransitionMapper', () => {
  it('should round-trip CartStateTransition domain → Prisma', () => {
    const t = new CartStateTransition({
      transitionId: UUID1,
      cartId: UUID2,
      fromState: 'ACTIVE',
      toState: 'CHECKED_OUT',
      stateVersion: 2,
      actorIdentityId: UUID3,
      actorKind: 'CUSTOMER',
      reasonReference: 'checkout',
      transitionedAt: NOW,
      createdAt: NOW,
    });

    const persistence = cartStateTransitionMapper.toPersistence(t);
    expect(persistence.transitionId).toBe(UUID1.value);
    expect(persistence.cartId).toBe(UUID2.value);
    expect(persistence.fromState).toBe('ACTIVE');
    expect(persistence.toState).toBe('CHECKED_OUT');
    expect(persistence.stateVersion).toBe(2);
    expect(persistence.actorKind).toBe('CUSTOMER');
  });

  it('should map Prisma row to CartStateTransition domain', () => {
    const row = {
      transitionId: UUID1.value,
      cartId: UUID2.value,
      fromState: 'ACTIVE' as CartState,
      toState: 'AUTO_EXPIRED' as CartState,
      stateVersion: 2,
      actorIdentityId: UUID3.value,
      actorKind: 'SYSTEM',
      reasonReference: '30-day-abandonment',
      correlationId: null,
      causationId: null,
      sourceReference: null,
      transitionedAt: NOW,
      createdAt: NOW,
    };

    const t = cartStateTransitionMapper.toDomain(row);
    expect(t.properties.fromState).toBe('ACTIVE');
    expect(t.properties.toState).toBe('AUTO_EXPIRED');
    expect(t.properties.reasonReference).toBe('30-day-abandonment');
  });
});

describe('cartAuditRecordMapper', () => {
  it('should round-trip CartAuditRecord domain → Prisma', () => {
    const r = new CartAuditRecord({
      auditEventId: UUID1,
      cartId: UUID2,
      customerProfileId: UUID3,
      eventType: 'CART_ITEM_ADDED',
      actorIdentityId: UUID4,
      occurredAt: NOW,
      createdAt: NOW,
    });

    const persistence = cartAuditRecordMapper.toPersistence(r);
    expect(persistence.auditEventId).toBe(UUID1.value);
    expect(persistence.cartId).toBe(UUID2.value);
    expect(persistence.customerProfileId).toBe(UUID3.value);
    expect(persistence.eventType).toBe('CART_ITEM_ADDED');
  });

  it('should map Prisma row to CartAuditRecord domain', () => {
    const row = {
      auditEventId: UUID1.value,
      cartId: UUID2.value,
      customerProfileId: UUID3.value,
      eventType: 'CART_CREATED',
      actorIdentityId: UUID4.value,
      correlationId: null,
      evidenceDigest: null,
      occurredAt: NOW,
      createdAt: NOW,
    };

    const r = cartAuditRecordMapper.toDomain(row);
    expect(r.properties.eventType).toBe('CART_CREATED');
    expect(r.properties.evidenceDigest).toBeUndefined();
  });
});
