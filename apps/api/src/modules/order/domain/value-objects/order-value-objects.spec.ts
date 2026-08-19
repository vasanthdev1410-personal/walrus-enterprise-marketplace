import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { OrderId } from './order-id';
import { OrderLineId } from './order-line-id';
import { ORDER_STATES, TERMINAL_ORDER_STATES, isTerminalOrderState } from './order-state';
import { OrderSnapshot } from './order-snapshot';
import { OrderLineSnapshot } from './order-line-snapshot';
import { MoneyAmount } from './money-amount';

const ORDER_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const PROFILE_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const SNAPSHOT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const SKU_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000005');
const PRODUCT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000006');
const LINE_UUID = new OrderLineId('0192a1b2-c3d4-7000-8000-000000000010');
const SNAPSHOT_ID_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000011');

describe('OrderId', () => {
  it('extends UuidV7', () => {
    const id = new OrderId('0192a1b2-c3d4-7000-8000-000000000001');
    expect(id).toBeInstanceOf(UuidV7);
  });
});

describe('OrderLineId', () => {
  it('extends UuidV7', () => {
    const id = new OrderLineId('0192a1b2-c3d4-7000-8000-000000000001');
    expect(id).toBeInstanceOf(UuidV7);
  });
});

describe('OrderState', () => {
  it('has 7 states', () => {
    expect(ORDER_STATES).toHaveLength(7);
  });

  it('has 2 terminal states (CANCELLED, CLOSED)', () => {
    expect(TERMINAL_ORDER_STATES).toHaveLength(2);
    expect(TERMINAL_ORDER_STATES).toContain('CANCELLED');
    expect(TERMINAL_ORDER_STATES).toContain('CLOSED');
  });

  it('isTerminalOrderState returns true for terminal states', () => {
    expect(isTerminalOrderState('CANCELLED')).toBe(true);
    expect(isTerminalOrderState('CLOSED')).toBe(true);
  });

  it('isTerminalOrderState returns false for non-terminal states', () => {
    expect(isTerminalOrderState('PENDING')).toBe(false);
    expect(isTerminalOrderState('CONFIRMED')).toBe(false);
    expect(isTerminalOrderState('PAID')).toBe(false);
    expect(isTerminalOrderState('SHIPPED')).toBe(false);
    // DELIVERED is not terminal for transitions (→ CLOSED)
    expect(isTerminalOrderState('DELIVERED')).toBe(false);
  });
});

describe('OrderSnapshot', () => {
  it('creates a valid snapshot', () => {
    const snapshot = new OrderSnapshot({
      snapshotId: SNAPSHOT_ID_UUID,
      orderId: ORDER_UUID,
      customerProfileId: PROFILE_UUID,
      cartSnapshotId: SNAPSHOT_UUID,
      items: [
        new OrderLineSnapshot({
          orderLineId: LINE_UUID,
          skuId: SKU_UUID,
          productId: PRODUCT_UUID,
          skuCode: 'SKU-001',
          quantity: 3,
          originalUnitPrice: new MoneyAmount(1999, 'USD'),
          revalidatedUnitPrice: new MoneyAmount(2199, 'USD'),
          snapshotTaxIncluded: true,
        }),
      ],
      totalLines: 1,
      totalItems: 3,
      subtotalAmount: new MoneyAmount(5997, 'USD'),
      createdAt: new Date('2026-08-19T12:00:00.000Z'),
    });
    expect(snapshot.properties.totalLines).toBe(1);
    expect(snapshot.properties.totalItems).toBe(3);
  });

  it('rejects empty items', () => {
    expect(
      () =>
        new OrderSnapshot({
          snapshotId: SNAPSHOT_ID_UUID,
          orderId: ORDER_UUID,
          customerProfileId: PROFILE_UUID,
          cartSnapshotId: SNAPSHOT_UUID,
          items: [],
          totalLines: 0,
          totalItems: 0,
          subtotalAmount: new MoneyAmount(0, 'USD'),
          createdAt: new Date('2026-08-19T12:00:00.000Z'),
        }),
    ).toThrow('Order snapshot must contain at least one item');
  });

  it('rejects totalLines mismatch', () => {
    expect(
      () =>
        new OrderSnapshot({
          snapshotId: SNAPSHOT_ID_UUID,
          orderId: ORDER_UUID,
          customerProfileId: PROFILE_UUID,
          cartSnapshotId: SNAPSHOT_UUID,
          items: [
            new OrderLineSnapshot({
              orderLineId: LINE_UUID,
              skuId: SKU_UUID,
              productId: PRODUCT_UUID,
              skuCode: 'SKU-001',
              quantity: 3,
              originalUnitPrice: new MoneyAmount(1999, 'USD'),
              revalidatedUnitPrice: new MoneyAmount(1999, 'USD'),
              snapshotTaxIncluded: true,
            }),
          ],
          totalLines: 2,
          totalItems: 3,
          subtotalAmount: new MoneyAmount(5997, 'USD'),
          createdAt: new Date('2026-08-19T12:00:00.000Z'),
        }),
    ).toThrow('Order snapshot totalLines must match items count');
  });

  it('rejects totalItems mismatch', () => {
    expect(
      () =>
        new OrderSnapshot({
          snapshotId: SNAPSHOT_ID_UUID,
          orderId: ORDER_UUID,
          customerProfileId: PROFILE_UUID,
          cartSnapshotId: SNAPSHOT_UUID,
          items: [
            new OrderLineSnapshot({
              orderLineId: LINE_UUID,
              skuId: SKU_UUID,
              productId: PRODUCT_UUID,
              skuCode: 'SKU-001',
              quantity: 3,
              originalUnitPrice: new MoneyAmount(1999, 'USD'),
              revalidatedUnitPrice: new MoneyAmount(1999, 'USD'),
              snapshotTaxIncluded: true,
            }),
          ],
          totalLines: 1,
          totalItems: 5,
          subtotalAmount: new MoneyAmount(5997, 'USD'),
          createdAt: new Date('2026-08-19T12:00:00.000Z'),
        }),
    ).toThrow('Order snapshot totalItems must match sum of item quantities');
  });
});

describe('OrderLineSnapshot', () => {
  it('creates a valid line snapshot', () => {
    const snapshot = new OrderLineSnapshot({
      orderLineId: LINE_UUID,
      skuId: SKU_UUID,
      productId: PRODUCT_UUID,
      skuCode: 'SKU-001',
      quantity: 3,
      originalUnitPrice: new MoneyAmount(1999, 'USD'),
      revalidatedUnitPrice: new MoneyAmount(2199, 'USD'),
      snapshotTaxIncluded: true,
    });
    expect(snapshot.properties.quantity).toBe(3);
    expect(snapshot.properties.originalUnitPrice.cents).toBe(1999);
    expect(snapshot.properties.revalidatedUnitPrice.cents).toBe(2199);
  });

  it('rejects quantity less than 1', () => {
    expect(
      () =>
        new OrderLineSnapshot({
          orderLineId: LINE_UUID,
          skuId: SKU_UUID,
          productId: PRODUCT_UUID,
          skuCode: 'SKU-001',
          quantity: 0,
          originalUnitPrice: new MoneyAmount(1999, 'USD'),
          revalidatedUnitPrice: new MoneyAmount(1999, 'USD'),
          snapshotTaxIncluded: true,
        }),
    ).toThrow('Order line snapshot quantity must be a positive safe integer');
  });
});
