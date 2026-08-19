import type {
  Cart as CartRow,
  CartAuditRecord as CartAuditRecordRow,
  CartLine as CartLineRow,
  CartStateTransition as CartStateTransitionRow,
  Prisma,
} from '../../../../../../generated/prisma/client';
import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { compactProperties } from '../../../../../identity-authentication/infrastructure/persistence/prisma/mappers/compact-properties';
import { Cart } from '../../../../domain/entities/cart';
import { CartAuditRecord } from '../../../../domain/entities/cart-audit-record';
import { CartLine } from '../../../../domain/entities/cart-line';
import { CartStateTransition } from '../../../../domain/entities/cart-state-transition';
import { CartId } from '../../../../domain/value-objects/cart-id';
import { CartLineId } from '../../../../domain/value-objects/cart-line-id';
import { MoneyAmount } from '../../../../domain/value-objects/money-amount';
import { Quantity } from '../../../../domain/value-objects/quantity';

/**
 * WEMP-M07-PLAN-001 M07-M2 persistence mappers. The shared platform
 * primitives (UuidV7, AggregateVersion, CorrelationIdentifier) and the
 * generic compactProperties helper are reused from the identity-authentication
 * module; Module 07 never reads Module 01/02/03/04/05/06 storage (A-05).
 *
 * Enum columns map directly because the domain unions use the identical
 * vocabulary; a malformed row fails closed through the domain constructor
 * (unknown enum/state values, invalid versions) rather than producing a
 * half-valid domain object.
 */
export const cartMapper = {
  toDomain(record: CartRow): Cart {
    return new Cart(
      compactProperties({
        cartId: new CartId(record.cartId),
        customerProfileId: new UuidV7(record.customerProfileId),
        state: record.state,
        totalLines: record.totalLines,
        totalItems: record.totalItems,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        expiresAt: record.expiresAt ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(entity: Cart): Prisma.CartUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      cartId: value.cartId.value,
      customerProfileId: value.customerProfileId.value,
      state: value.state,
      totalLines: value.totalLines,
      totalItems: value.totalItems,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      expiresAt: value.expiresAt,
      correlationId: value.correlationId?.value,
    });
  },
};

export const cartLineMapper = {
  toDomain(record: CartLineRow): CartLine {
    return new CartLine(
      compactProperties({
        cartLineId: new CartLineId(record.cartLineId),
        cartId: new CartId(record.cartId),
        skuId: new UuidV7(record.skuId),
        productId: new UuidV7(record.productId),
        skuCode: record.skuCode,
        quantity: new Quantity(record.quantity),
        unitPrice: new MoneyAmount(record.unitPriceAmount, record.unitPriceCurrency),
        snapshotTaxIncluded: record.snapshotTaxIncluded,
        productUnavailable: record.productUnavailable,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(entity: CartLine): Prisma.CartLineUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      cartLineId: value.cartLineId.value,
      cartId: value.cartId.value,
      skuId: value.skuId.value,
      productId: value.productId.value,
      skuCode: value.skuCode,
      quantity: value.quantity.value,
      unitPriceAmount: value.unitPrice.cents,
      unitPriceCurrency: value.unitPrice.currencyCode,
      snapshotTaxIncluded: value.snapshotTaxIncluded,
      productUnavailable: value.productUnavailable,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const cartStateTransitionMapper = {
  toDomain(record: CartStateTransitionRow): CartStateTransition {
    return new CartStateTransition(
      compactProperties({
        transitionId: new UuidV7(record.transitionId),
        cartId: new UuidV7(record.cartId),
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
  toPersistence(entity: CartStateTransition): Prisma.CartStateTransitionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      transitionId: value.transitionId.value,
      cartId: value.cartId.value,
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

export const cartAuditRecordMapper = {
  toDomain(record: CartAuditRecordRow): CartAuditRecord {
    return new CartAuditRecord(
      compactProperties({
        auditEventId: new UuidV7(record.auditEventId),
        cartId: new UuidV7(record.cartId),
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
  toPersistence(entity: CartAuditRecord): Prisma.CartAuditRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      auditEventId: value.auditEventId.value,
      cartId: value.cartId.value,
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
