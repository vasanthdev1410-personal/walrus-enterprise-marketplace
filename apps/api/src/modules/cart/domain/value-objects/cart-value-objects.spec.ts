import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { CartId } from '../value-objects/cart-id';
import { CartLineId } from '../value-objects/cart-line-id';
import { Quantity, DEFAULT_MIN_QUANTITY, DEFAULT_MAX_QUANTITY } from '../value-objects/quantity';
import { MoneyAmount } from '../value-objects/money-amount';
import {
  CART_STATES,
  TERMINAL_CART_STATES,
  isTerminalCartState,
} from '../value-objects/cart-state';
import { CartItemSnapshot } from '../value-objects/cart-item-snapshot';
import { CartSnapshot } from '../value-objects/cart-snapshot';

const UUID1 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const UUID2 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const UUID3 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');

describe('CartId', () => {
  it('should accept a valid UUIDv7', () => {
    const id = new CartId('0192a1b2-c3d4-7000-8000-000000000001');
    expect(id.value).toBe('0192a1b2-c3d4-7000-8000-000000000001');
  });

  it('should lowercase the value', () => {
    const id = new CartId('0192A1B2-C3D4-7000-8000-000000000001');
    expect(id.value).toBe('0192a1b2-c3d4-7000-8000-000000000001');
  });

  it('should reject an invalid UUID', () => {
    expect(() => new CartId('not-a-uuid')).toThrow('UUID version 7');
  });
});

describe('CartLineId', () => {
  it('should accept a valid UUIDv7', () => {
    const id = new CartLineId('0192a1b2-c3d4-7000-8000-000000000001');
    expect(id.value).toBe('0192a1b2-c3d4-7000-8000-000000000001');
  });
});

describe('Quantity', () => {
  it('should accept the minimum value', () => {
    const q = new Quantity(DEFAULT_MIN_QUANTITY);
    expect(q.value).toBe(1);
  });

  it('should accept the maximum value', () => {
    const q = new Quantity(DEFAULT_MAX_QUANTITY);
    expect(q.value).toBe(100);
  });

  it('should accept mid-range values', () => {
    expect(new Quantity(50).value).toBe(50);
  });

  it('should reject zero', () => {
    expect(() => new Quantity(0)).toThrow('positive safe integer');
  });

  it('should reject negative values', () => {
    expect(() => new Quantity(-1)).toThrow('positive safe integer');
  });

  it('should reject values above the maximum', () => {
    expect(() => new Quantity(DEFAULT_MAX_QUANTITY + 1)).toThrow('must not exceed');
  });

  it('should reject non-integer values', () => {
    expect(() => new Quantity(1.5)).toThrow('positive safe integer');
  });
});

describe('MoneyAmount', () => {
  it('should accept zero cents', () => {
    const m = new MoneyAmount(0, 'USD');
    expect(m.cents).toBe(0);
    expect(m.currencyCode).toBe('USD');
  });

  it('should accept positive cents', () => {
    const m = new MoneyAmount(1999, 'EUR');
    expect(m.cents).toBe(1999);
  });

  it('should reject negative cents', () => {
    expect(() => new MoneyAmount(-1, 'USD')).toThrow('non-negative');
  });

  it('should reject non-integer cents', () => {
    expect(() => new MoneyAmount(1.5, 'USD')).toThrow('non-negative');
  });

  it('should reject invalid currency codes', () => {
    expect(() => new MoneyAmount(100, 'us')).toThrow('ISO 4217');
    expect(() => new MoneyAmount(100, 'USDX')).toThrow('ISO 4217');
    expect(() => new MoneyAmount(100, '123')).toThrow('ISO 4217');
  });

  it('should accept valid ISO 4217 codes', () => {
    expect(new MoneyAmount(100, 'GBP').currencyCode).toBe('GBP');
    expect(new MoneyAmount(100, 'JPY').currencyCode).toBe('JPY');
  });
});

describe('CartState', () => {
  it('should have the correct states', () => {
    expect(CART_STATES).toEqual(['ACTIVE', 'CHECKED_OUT', 'ARCHIVED', 'AUTO_EXPIRED']);
  });

  it('should identify terminal states', () => {
    expect(isTerminalCartState('ACTIVE')).toBe(false);
    expect(isTerminalCartState('CHECKED_OUT')).toBe(false);
    expect(isTerminalCartState('ARCHIVED')).toBe(true);
    expect(isTerminalCartState('AUTO_EXPIRED')).toBe(false);
  });

  it('should list terminal states', () => {
    expect(TERMINAL_CART_STATES).toEqual(['ARCHIVED']);
  });
});

describe('CartItemSnapshot', () => {
  it('should create a valid snapshot', () => {
    const snap = new CartItemSnapshot({
      cartLineId: new CartLineId(UUID1.value),
      skuId: UUID2,
      productId: UUID3,
      skuCode: 'SKU-001',
      quantity: 3,
      unitPrice: new MoneyAmount(1999, 'USD'),
      snapshotTaxIncluded: true,
      productUnavailable: false,
    });
    expect(snap.properties.quantity).toBe(3);
    expect(snap.properties.unitPrice.cents).toBe(1999);
  });

  it('should reject zero quantity', () => {
    expect(
      () =>
        new CartItemSnapshot({
          cartLineId: new CartLineId(UUID1.value),
          skuId: UUID2,
          productId: UUID3,
          skuCode: 'SKU-001',
          quantity: 0,
          unitPrice: new MoneyAmount(1999, 'USD'),
          snapshotTaxIncluded: true,
          productUnavailable: false,
        }),
    ).toThrow('positive safe integer');
  });

  it('should reject negative quantity', () => {
    expect(
      () =>
        new CartItemSnapshot({
          cartLineId: new CartLineId(UUID1.value),
          skuId: UUID2,
          productId: UUID3,
          skuCode: 'SKU-001',
          quantity: -1,
          unitPrice: new MoneyAmount(1999, 'USD'),
          snapshotTaxIncluded: true,
          productUnavailable: false,
        }),
    ).toThrow('positive safe integer');
  });
});

describe('CartSnapshot', () => {
  const makeItem = (qty: number): CartItemSnapshot =>
    new CartItemSnapshot({
      cartLineId: new CartLineId(UUID1.value),
      skuId: UUID2,
      productId: UUID3,
      skuCode: 'SKU-001',
      quantity: qty,
      unitPrice: new MoneyAmount(1999, 'USD'),
      snapshotTaxIncluded: true,
      productUnavailable: false,
    });

  it('should create a valid snapshot with matching counts', () => {
    const snap = new CartSnapshot({
      snapshotId: new CartId(UUID1.value),
      cartId: new CartId(UUID1.value),
      customerProfileId: new CartId(UUID2.value),
      items: [makeItem(2), makeItem(3)],
      totalLines: 2,
      totalItems: 5,
      subtotalAmount: new MoneyAmount(9995, 'USD'),
      createdAt: new Date(),
    });
    expect(snap.properties.totalLines).toBe(2);
    expect(snap.properties.totalItems).toBe(5);
  });

  it('should reject empty items', () => {
    expect(
      () =>
        new CartSnapshot({
          snapshotId: new CartId(UUID1.value),
          cartId: new CartId(UUID1.value),
          customerProfileId: new CartId(UUID2.value),
          items: [],
          totalLines: 0,
          totalItems: 0,
          subtotalAmount: new MoneyAmount(0, 'USD'),
          createdAt: new Date(),
        }),
    ).toThrow('at least one item');
  });

  it('should reject mismatched totalLines', () => {
    expect(
      () =>
        new CartSnapshot({
          snapshotId: new CartId(UUID1.value),
          cartId: new CartId(UUID1.value),
          customerProfileId: new CartId(UUID2.value),
          items: [makeItem(1)],
          totalLines: 2,
          totalItems: 1,
          subtotalAmount: new MoneyAmount(1999, 'USD'),
          createdAt: new Date(),
        }),
    ).toThrow('totalLines must match items count');
  });

  it('should reject mismatched totalItems', () => {
    expect(
      () =>
        new CartSnapshot({
          snapshotId: new CartId(UUID1.value),
          cartId: new CartId(UUID1.value),
          customerProfileId: new CartId(UUID2.value),
          items: [makeItem(2)],
          totalLines: 1,
          totalItems: 5,
          subtotalAmount: new MoneyAmount(3998, 'USD'),
          createdAt: new Date(),
        }),
    ).toThrow('totalItems must match sum');
  });
});
