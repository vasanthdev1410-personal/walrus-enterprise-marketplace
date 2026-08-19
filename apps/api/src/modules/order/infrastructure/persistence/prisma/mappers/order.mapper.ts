import type {
  Order as OrderRow,
  OrderAuditRecord as OrderAuditRecordRow,
  OrderLine as OrderLineRow,
  OrderStateTransition as OrderStateTransitionRow,
  Prisma,
} from '../../../../../../generated/prisma/client';
import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { compactProperties } from '../../../../../identity-authentication/infrastructure/persistence/prisma/mappers/compact-properties';
import { Order } from '../../../../domain/entities/order';
import { OrderAuditRecord } from '../../../../domain/entities/order-audit-record';
import { OrderLine } from '../../../../domain/entities/order-line';
import { OrderStateTransition } from '../../../../domain/entities/order-state-transition';
import { MoneyAmount } from '../../../../domain/value-objects/money-amount';
import { OrderId } from '../../../../domain/value-objects/order-id';
import { OrderLineId } from '../../../../domain/value-objects/order-line-id';
import { Quantity } from '../../../../domain/value-objects/quantity';

/**
 * WEMP-M08-PLAN-001 M08-M2 persistence mappers. The shared platform
 * primitives (UuidV7, AggregateVersion, CorrelationIdentifier) and the
 * generic compactProperties helper are reused from the identity-authentication
 * module; Module 08 never reads Module 01/02/03/04/05/06/07 storage (A-05).
 *
 * Enum columns map directly because the domain unions use the identical
 * vocabulary; a malformed row fails closed through the domain constructor
 * (unknown enum/state values, invalid versions) rather than producing a
 * half-valid domain object.
 */
export const orderMapper = {
  toDomain(record: OrderRow): Order {
    return new Order(
      compactProperties({
        orderId: new OrderId(record.orderId),
        customerProfileId: new UuidV7(record.customerProfileId),
        snapshotId: new UuidV7(record.snapshotId),
        cartId: new UuidV7(record.cartId),
        state: record.state,
        totalLines: record.totalLines,
        totalItems: record.totalItems,
        subtotalAmountCents: record.subtotalAmountCents,
        subtotalCurrency: record.subtotalCurrency,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(entity: Order): Prisma.OrderUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      orderId: value.orderId.value,
      customerProfileId: value.customerProfileId.value,
      snapshotId: value.snapshotId.value,
      cartId: value.cartId.value,
      state: value.state,
      totalLines: value.totalLines,
      totalItems: value.totalItems,
      subtotalAmountCents: value.subtotalAmountCents,
      subtotalCurrency: value.subtotalCurrency,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      correlationId: value.correlationId?.value,
    });
  },
};

export const orderLineMapper = {
  toDomain(record: OrderLineRow): OrderLine {
    return new OrderLine(
      compactProperties({
        orderLineId: new OrderLineId(record.orderLineId),
        orderId: new UuidV7(record.orderId),
        cartLineId: new UuidV7(record.cartLineId),
        skuId: new UuidV7(record.skuId),
        productId: new UuidV7(record.productId),
        skuCode: record.skuCode,
        quantity: new Quantity(record.quantity),
        unitPrice: new MoneyAmount(record.unitPriceAmount, record.unitPriceCurrency),
        snapshotTaxIncluded: record.snapshotTaxIncluded,
        revalidated: record.revalidated,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(entity: OrderLine): Prisma.OrderLineUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      orderLineId: value.orderLineId.value,
      orderId: value.orderId.value,
      cartLineId: value.cartLineId.value,
      skuId: value.skuId.value,
      productId: value.productId.value,
      skuCode: value.skuCode,
      quantity: value.quantity.value,
      unitPriceAmount: value.unitPrice.cents,
      unitPriceCurrency: value.unitPrice.currencyCode,
      snapshotTaxIncluded: value.snapshotTaxIncluded,
      revalidated: value.revalidated,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const orderStateTransitionMapper = {
  toDomain(record: OrderStateTransitionRow): OrderStateTransition {
    return new OrderStateTransition(
      compactProperties({
        transitionId: new UuidV7(record.transitionId),
        orderId: new UuidV7(record.orderId),
        fromState: record.fromState,
        toState: record.toState,
        stateVersion: record.stateVersion,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        actorKind: record.actorKind,
        reasonReference: record.reasonReference,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        causationId: record.causationId === null ? undefined : new UuidV7(record.causationId),
        sourceReference: record.sourceReference ?? undefined,
        transitionedAt: record.transitionedAt,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(entity: OrderStateTransition): Prisma.OrderStateTransitionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      transitionId: value.transitionId.value,
      orderId: value.orderId.value,
      fromState: value.fromState,
      toState: value.toState,
      stateVersion: value.stateVersion,
      actorIdentityId: value.actorIdentityId.value,
      actorKind: value.actorKind,
      reasonReference: value.reasonReference,
      correlationId: value.correlationId?.value,
      causationId: value.causationId?.value,
      sourceReference: value.sourceReference,
      transitionedAt: value.transitionedAt,
      createdAt: value.createdAt,
    });
  },
};

export const orderAuditRecordMapper = {
  toDomain(record: OrderAuditRecordRow): OrderAuditRecord {
    return new OrderAuditRecord(
      compactProperties({
        auditEventId: new UuidV7(record.auditEventId),
        orderId: new UuidV7(record.orderId),
        customerProfileId: new UuidV7(record.customerProfileId),
        eventType: record.eventType,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        evidenceDigest: record.evidenceDigest ?? undefined,
        occurredAt: record.occurredAt,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(entity: OrderAuditRecord): Prisma.OrderAuditRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      auditEventId: value.auditEventId.value,
      orderId: value.orderId.value,
      customerProfileId: value.customerProfileId.value,
      eventType: value.eventType,
      actorIdentityId: value.actorIdentityId.value,
      correlationId: value.correlationId?.value,
      evidenceDigest: value.evidenceDigest,
      occurredAt: value.occurredAt,
      createdAt: value.createdAt,
    });
  },
};
