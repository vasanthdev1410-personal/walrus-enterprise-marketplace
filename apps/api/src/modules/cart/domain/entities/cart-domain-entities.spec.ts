import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Cart } from '../entities/cart';
import { CartLine } from '../entities/cart-line';
import { CartId } from '../value-objects/cart-id';
import { CartLineId } from '../value-objects/cart-line-id';
import { Quantity } from '../value-objects/quantity';
import { MoneyAmount } from '../value-objects/money-amount';

const PROFILE_ID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const CART_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const SKU_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const PRODUCT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const NOW = new Date('2026-08-18T00:00:00Z');

describe('Cart aggregate root', () => {
  it('should create a valid active cart', () => {
    const cart = new Cart({
      cartId: new CartId(CART_UUID.value),
      customerProfileId: new CartId(PROFILE_ID.value),
      state: 'ACTIVE',
      totalLines: 0,
      totalItems: 0,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(cart.properties.state).toBe('ACTIVE');
    expect(cart.properties.totalLines).toBe(0);
    expect(cart.properties.totalItems).toBe(0);
  });

  it('should freeze properties', () => {
    const cart = new Cart({
      cartId: new CartId(CART_UUID.value),
      customerProfileId: new CartId(PROFILE_ID.value),
      state: 'ACTIVE',
      totalLines: 1,
      totalItems: 3,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(() => {
      (cart.properties as Record<string, unknown>).totalLines = 5;
    }).toThrow();
  });

  it('should accept optional expiresAt', () => {
    const expires = new Date('2026-09-17T00:00:00Z');
    const cart = new Cart({
      cartId: new CartId(CART_UUID.value),
      customerProfileId: new CartId(PROFILE_ID.value),
      state: 'ACTIVE',
      totalLines: 0,
      totalItems: 0,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: expires,
    });
    expect(cart.properties.expiresAt).toBe(expires);
  });

  it('should reject negative totalLines', () => {
    expect(
      () =>
        new Cart({
          cartId: new CartId(CART_UUID.value),
          customerProfileId: new CartId(PROFILE_ID.value),
          state: 'ACTIVE',
          totalLines: -1,
          totalItems: 0,
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
    ).toThrow('non-negative safe integer');
  });

  it('should reject totalItems less than totalLines', () => {
    expect(
      () =>
        new Cart({
          cartId: new CartId(CART_UUID.value),
          customerProfileId: new CartId(PROFILE_ID.value),
          state: 'ACTIVE',
          totalLines: 3,
          totalItems: 2,
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
    ).toThrow('totalItems cannot be less than totalLines');
  });

  it('should reject updatedAt before createdAt', () => {
    expect(
      () =>
        new Cart({
          cartId: new CartId(CART_UUID.value),
          customerProfileId: new CartId(PROFILE_ID.value),
          state: 'ACTIVE',
          totalLines: 0,
          totalItems: 0,
          aggregateVersion: new AggregateVersion(1),
          createdAt: new Date('2026-08-19'),
          updatedAt: NOW,
        }),
    ).toThrow('updatedAt cannot precede createdAt');
  });

  it('should reject expiresAt before createdAt', () => {
    expect(
      () =>
        new Cart({
          cartId: new CartId(CART_UUID.value),
          customerProfileId: new CartId(PROFILE_ID.value),
          state: 'ACTIVE',
          totalLines: 0,
          totalItems: 0,
          aggregateVersion: new AggregateVersion(1),
          createdAt: new Date('2026-08-20'),
          updatedAt: new Date('2026-08-20'),
          expiresAt: NOW,
        }),
    ).toThrow('expiresAt cannot precede createdAt');
  });
});

describe('CartLine entity', () => {
  it('should create a valid cart line', () => {
    const line = new CartLine({
      cartLineId: new CartLineId(CART_UUID.value),
      cartId: new CartId(PROFILE_ID.value),
      skuId: SKU_UUID,
      productId: PRODUCT_UUID,
      skuCode: 'SKU-001',
      quantity: new Quantity(3),
      unitPrice: new MoneyAmount(1999, 'USD'),
      snapshotTaxIncluded: true,
      productUnavailable: false,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(line.properties.skuCode).toBe('SKU-001');
    expect(line.properties.quantity.value).toBe(3);
    expect(line.properties.unitPrice.cents).toBe(1999);
  });

  it('should freeze properties', () => {
    const line = new CartLine({
      cartLineId: new CartLineId(CART_UUID.value),
      cartId: new CartId(PROFILE_ID.value),
      skuId: SKU_UUID,
      productId: PRODUCT_UUID,
      skuCode: 'SKU-001',
      quantity: new Quantity(1),
      unitPrice: new MoneyAmount(500, 'USD'),
      snapshotTaxIncluded: false,
      productUnavailable: false,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(() => {
      (line.properties as Record<string, unknown>).quantity = new Quantity(5);
    }).toThrow();
  });

  it('should reject empty skuCode', () => {
    expect(
      () =>
        new CartLine({
          cartLineId: new CartLineId(CART_UUID.value),
          cartId: new CartId(PROFILE_ID.value),
          skuId: SKU_UUID,
          productId: PRODUCT_UUID,
          skuCode: '  ',
          quantity: new Quantity(1),
          unitPrice: new MoneyAmount(500, 'USD'),
          snapshotTaxIncluded: false,
          productUnavailable: false,
          aggregateVersion: new AggregateVersion(1),
          createdAt: NOW,
          updatedAt: NOW,
        }),
    ).toThrow('skuCode is required');
  });

  it('should accept productUnavailable flag', () => {
    const line = new CartLine({
      cartLineId: new CartLineId(CART_UUID.value),
      cartId: new CartId(PROFILE_ID.value),
      skuId: SKU_UUID,
      productId: PRODUCT_UUID,
      skuCode: 'SKU-001',
      quantity: new Quantity(1),
      unitPrice: new MoneyAmount(500, 'USD'),
      snapshotTaxIncluded: false,
      productUnavailable: true,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(line.properties.productUnavailable).toBe(true);
  });

  it('should accept zero cents unit price', () => {
    const line = new CartLine({
      cartLineId: new CartLineId(CART_UUID.value),
      cartId: new CartId(PROFILE_ID.value),
      skuId: SKU_UUID,
      productId: PRODUCT_UUID,
      skuCode: 'SKU-001',
      quantity: new Quantity(1),
      unitPrice: new MoneyAmount(0, 'USD'),
      snapshotTaxIncluded: false,
      productUnavailable: false,
      aggregateVersion: new AggregateVersion(1),
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(line.properties.unitPrice.cents).toBe(0);
  });
});
