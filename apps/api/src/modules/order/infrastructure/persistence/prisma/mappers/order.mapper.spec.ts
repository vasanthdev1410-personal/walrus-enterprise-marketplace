import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Order } from '../../../../domain/entities/order';
import { OrderAuditRecord } from '../../../../domain/entities/order-audit-record';
import { OrderLine } from '../../../../domain/entities/order-line';
import { OrderStateTransition } from '../../../../domain/entities/order-state-transition';
import { MoneyAmount } from '../../../../domain/value-objects/money-amount';
import { OrderId } from '../../../../domain/value-objects/order-id';
import { OrderLineId } from '../../../../domain/value-objects/order-line-id';
import { Quantity } from '../../../../domain/value-objects/quantity';
import type { OrderState } from '../../../../domain/value-objects/order-state';
import {
  orderAuditRecordMapper,
  orderLineMapper,
  orderMapper,
  orderStateTransitionMapper,
} from './order.mapper';

const UUID1 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const UUID2 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const UUID3 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');
const UUID4 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000004');
const UUID5 = new UuidV7('0192a1b2-c3d4-7000-8000-000000000005');
const NOW = new Date('2026-08-19T00:00:00.000Z');

describe('orderMapper', () => {
  it('should round-trip Order domain → Prisma → domain', () => {
    const order = new Order({
      orderId: new OrderId(UUID1.value),
      customerProfileId: UUID2,
      snapshotId: UUID3,
      cartId: UUID4,
      state: 'PENDING',
      totalLines: 2,
      totalItems: 5,
      subtotalAmountCents: 9995,
      subtotalCurrency: 'USD',
      aggregateVersion: new AggregateVersion(3),
      createdAt: NOW,
      updatedAt: NOW,
    });

    const persistence = orderMapper.toPersistence(order);
    expect(persistence.orderId).toBe(UUID1.value);
    expect(persistence.customerProfileId).toBe(UUID2.value);
    expect(persistence.state).toBe('PENDING');
    expect(persistence.totalLines).toBe(2);
    expect(persistence.totalItems).toBe(5);
    expect(persistence.subtotalAmountCents).toBe(9995);
    expect(persistence.aggregateVersion).toBe(3);
  });

  it('should map Prisma row to Order domain', () => {
    const row = {
      orderId: UUID1.value,
      customerProfileId: UUID2.value,
      snapshotId: UUID3.value,
      cartId: UUID4.value,
      state: 'PENDING' as OrderState,
      totalLines: 1,
      totalItems: 2,
      subtotalAmountCents: 3998,
      subtotalCurrency: 'USD',
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      correlationId: null,
    };

    const order = orderMapper.toDomain(row);
    expect(order.properties.orderId.value).toBe(UUID1.value);
    expect(order.properties.state).toBe('PENDING');
    expect(order.properties.totalLines).toBe(1);
    expect(order.properties.correlationId).toBeUndefined();
  });
});

describe('orderLineMapper', () => {
  it('should round-trip OrderLine domain → Prisma', () => {
    const line = new OrderLine({
      orderLineId: new OrderLineId(UUID1.value),
      orderId: UUID2,
      cartLineId: UUID3,
      skuId: UUID4,
      productId: UUID5,
      skuCode: 'SKU-001',
      quantity: new Quantity(3),
      unitPrice: new MoneyAmount(1999, 'USD'),
      snapshotTaxIncluded: true,
      revalidated: true,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const persistence = orderLineMapper.toPersistence(line);
    expect(persistence.orderLineId).toBe(UUID1.value);
    expect(persistence.orderId).toBe(UUID2.value);
    expect(persistence.skuCode).toBe('SKU-001');
    expect(persistence.quantity).toBe(3);
    expect(persistence.unitPriceAmount).toBe(1999);
    expect(persistence.revalidated).toBe(true);
  });
});

describe('orderStateTransitionMapper', () => {
  it('should round-trip OrderStateTransition domain → Prisma', () => {
    const transition = new OrderStateTransition({
      transitionId: UUID1,
      orderId: UUID2,
      fromState: 'PENDING',
      toState: 'CONFIRMED',
      stateVersion: 2,
      actorIdentityId: UUID3,
      actorKind: 'SYSTEM',
      reasonReference: 'payment_initiated',
      transitionedAt: NOW,
      createdAt: NOW,
    });

    const persistence = orderStateTransitionMapper.toPersistence(transition);
    expect(persistence.transitionId).toBe(UUID1.value);
    expect(persistence.orderId).toBe(UUID2.value);
    expect(persistence.fromState).toBe('PENDING');
    expect(persistence.toState).toBe('CONFIRMED');
    expect(persistence.stateVersion).toBe(2);
  });
});

describe('orderAuditRecordMapper', () => {
  it('should round-trip OrderAuditRecord domain → Prisma', () => {
    const record = new OrderAuditRecord({
      auditEventId: UUID1,
      orderId: UUID2,
      customerProfileId: UUID3,
      eventType: 'ORDER_CREATED',
      actorIdentityId: UUID4,
      occurredAt: NOW,
      createdAt: NOW,
    });

    const persistence = orderAuditRecordMapper.toPersistence(record);
    expect(persistence.auditEventId).toBe(UUID1.value);
    expect(persistence.orderId).toBe(UUID2.value);
    expect(persistence.eventType).toBe('ORDER_CREATED');
  });
});
