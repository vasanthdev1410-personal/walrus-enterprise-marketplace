import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { MoneyAmount } from '../value-objects/money-amount';
import { Quantity } from '../value-objects/quantity';
import { Order } from './order';
import { OrderLine } from './order-line';
import { OrderLineId } from '../value-objects/order-line-id';
import { OrderAuditRecord } from './order-audit-record';
import type { OrderProperties } from './order';
import type { OrderLineProperties } from './order-line';

const ORDER_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const PROFILE_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const SNAPSHOT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const CART_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const SKU_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000005');
const PRODUCT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000006');
const LINE_UUID = new OrderLineId('0192a1b2-c3d4-7000-8000-000000000007');
const CART_LINE_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000008');
const AUDIT_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000020');

function makeNow(): Date {
  return new Date('2026-08-19T12:00:00.000Z');
}

const DEFAULT_ORDER_PROPS: OrderProperties = {
  orderId: ORDER_UUID,
  customerProfileId: PROFILE_UUID,
  snapshotId: SNAPSHOT_UUID,
  cartId: CART_UUID,
  state: 'PENDING',
  totalLines: 1,
  totalItems: 3,
  subtotalAmountCents: 5997,
  subtotalCurrency: 'USD',
  aggregateVersion: new AggregateVersion(1),
  createdAt: makeNow(),
  updatedAt: makeNow(),
};

const DEFAULT_ORDER_LINE_PROPS: OrderLineProperties = {
  orderLineId: LINE_UUID,
  orderId: ORDER_UUID,
  cartLineId: CART_LINE_UUID,
  skuId: SKU_UUID,
  productId: PRODUCT_UUID,
  skuCode: 'SKU-001',
  quantity: new Quantity(3),
  unitPrice: new MoneyAmount(1999, 'USD'),
  snapshotTaxIncluded: true,
  revalidated: true,
  createdAt: makeNow(),
  updatedAt: makeNow(),
};

function createValidOrder(overrides: Partial<OrderProperties> = {}): Order {
  return new Order({ ...DEFAULT_ORDER_PROPS, ...overrides });
}

function createValidOrderLine(overrides: Partial<OrderLineProperties> = {}): OrderLine {
  return new OrderLine({ ...DEFAULT_ORDER_LINE_PROPS, ...overrides });
}

describe('Order aggregate root', () => {
  it('creates a valid order with all required properties', () => {
    const order = createValidOrder();
    expect(order.properties.orderId.value).toBe('0192a1b2-c3d4-7000-8000-000000000001');
    expect(order.properties.state).toBe('PENDING');
    expect(order.properties.totalLines).toBe(1);
    expect(order.properties.totalItems).toBe(3);
    expect(order.properties.subtotalAmountCents).toBe(5997);
    expect(order.properties.subtotalCurrency).toBe('USD');
  });

  it('freezes the order properties', () => {
    const order = createValidOrder();
    expect(Object.isFrozen(order.properties)).toBe(true);
  });

  it('rejects totalLines less than 0', () => {
    expect(() => createValidOrder({ totalLines: -1 })).toThrow(
      'Order totalLines must be a non-negative safe integer',
    );
  });

  it('rejects totalItems less than 0', () => {
    expect(() => createValidOrder({ totalItems: -1 })).toThrow(
      'Order totalItems must be a non-negative safe integer',
    );
  });

  it('rejects totalItems less than totalLines', () => {
    expect(() => createValidOrder({ totalLines: 3, totalItems: 2 })).toThrow(
      'Order totalItems cannot be less than totalLines',
    );
  });

  it('rejects order with zero lines', () => {
    expect(() => createValidOrder({ totalLines: 0, totalItems: 0 })).toThrow(
      'Order must contain at least one line',
    );
  });

  it('rejects negative subtotalAmountCents', () => {
    expect(() => createValidOrder({ subtotalAmountCents: -1 })).toThrow(
      'Order subtotalAmountCents must be a non-negative safe integer',
    );
  });

  it('rejects invalid subtotalCurrency', () => {
    expect(() => createValidOrder({ subtotalCurrency: 'us' })).toThrow(
      'Order subtotalCurrency must be an ISO 4217 alpha-3 code',
    );
  });

  it('rejects updatedAt before createdAt', () => {
    const now = makeNow();
    const before = new Date(now.getTime() - 1000);
    expect(() => createValidOrder({ createdAt: now, updatedAt: before })).toThrow(
      'Order updatedAt cannot precede createdAt',
    );
  });
});

describe('OrderLine entity', () => {
  it('creates a valid order line with all required properties', () => {
    const line = createValidOrderLine();
    expect(line.properties.skuCode).toBe('SKU-001');
    expect(line.properties.quantity.value).toBe(3);
    expect(line.properties.unitPrice.cents).toBe(1999);
    expect(line.properties.revalidated).toBe(true);
  });

  it('freezes the order line properties', () => {
    const line = createValidOrderLine();
    expect(Object.isFrozen(line.properties)).toBe(true);
  });

  it('rejects empty skuCode', () => {
    expect(() => createValidOrderLine({ skuCode: '' })).toThrow('Order line skuCode is required');
  });

  it('rejects quantity less than 1', () => {
    expect(() => createValidOrderLine({ quantity: new Quantity(0) })).toThrow();
  });

  it('rejects negative unit price', () => {
    expect(() => createValidOrderLine({ unitPrice: new MoneyAmount(-1, 'USD') })).toThrow();
  });

  it('rejects updatedAt before createdAt', () => {
    const now = makeNow();
    const before = new Date(now.getTime() - 1000);
    expect(() => createValidOrderLine({ createdAt: now, updatedAt: before })).toThrow(
      'Order line updatedAt cannot precede createdAt',
    );
  });
});

describe('OrderAuditRecord entity', () => {
  it('creates a valid audit record', () => {
    const record = new OrderAuditRecord({
      auditEventId: AUDIT_UUID,
      orderId: ORDER_UUID,
      customerProfileId: PROFILE_UUID,
      eventType: 'ORDER_CREATED',
      actorIdentityId: PROFILE_UUID,
      occurredAt: makeNow(),
      createdAt: makeNow(),
    });
    expect(record.properties.eventType).toBe('ORDER_CREATED');
  });

  it('rejects empty eventType', () => {
    expect(
      () =>
        new OrderAuditRecord({
          auditEventId: AUDIT_UUID,
          orderId: ORDER_UUID,
          customerProfileId: PROFILE_UUID,
          eventType: '',
          actorIdentityId: PROFILE_UUID,
          occurredAt: makeNow(),
          createdAt: makeNow(),
        }),
    ).toThrow('Order audit record eventType is required');
  });
});
