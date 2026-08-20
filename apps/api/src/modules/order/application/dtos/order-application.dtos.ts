/**
 * WEMP-M08-PLAN-001 M08-M3. Application-layer DTOs for the order module:
 * command objects for mutations, query objects for reads, and result objects
 * returned by the application service. These are the API-level contracts
 * that M08-M5 controllers will consume; the application service translates
 * between DTOs and domain entities.
 */
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { OrderState } from '../../domain/value-objects/order-state';

// ---------------------------------------------------------------------------
// Commands (mutations)
// ---------------------------------------------------------------------------

/** Creates a new order from a CartSnapshot. The primary use-case for M08. */
export interface CreateOrderCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly snapshotId: UuidV7;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

/** Transitions an order to a new state (system/admin callback). */
export interface TransitionOrderCommand {
  readonly orderId: UuidV7;
  readonly toState: OrderState;
  readonly actorIdentityId: UuidV7;
  readonly actorKind: 'CUSTOMER' | 'SYSTEM' | 'ADMIN';
  readonly reasonReference: string;
  readonly expectedVersion?: number;
  readonly correlationId?: CorrelationIdentifier;
}

/** Cancels a pending order (customer self-service). */
export interface CancelOrderCommand {
  readonly customerProfileId: UuidV7;
  readonly orderId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly reasonReference: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

// ---------------------------------------------------------------------------
// Commands (expiry — system actor)
// ---------------------------------------------------------------------------

/** Expires a single order (system actor, for cleanup). */
export interface ExpireOrderCommand {
  readonly orderId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly reasonReference: string;
  readonly correlationId?: CorrelationIdentifier;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Read a single order by ID. */
export interface ReadOrderQuery {
  readonly orderId: UuidV7;
  readonly callerIdentityId: UuidV7;
}

/** List orders for a customer profile. */
export interface ListOrdersQuery {
  readonly customerProfileId: UuidV7;
  readonly callerIdentityId: UuidV7;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface OrderLineResult {
  readonly orderLineId: string;
  readonly cartLineId: string;
  readonly skuId: string;
  readonly productId: string;
  readonly skuCode: string;
  readonly quantity: number;
  readonly unitPriceAmount: number;
  readonly unitPriceCurrency: string;
  readonly snapshotTaxIncluded: boolean;
  readonly revalidated: boolean;
}

export interface OrderResult {
  readonly orderId: string;
  readonly customerProfileId: string;
  readonly snapshotId: string;
  readonly cartId: string;
  readonly state: OrderState;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly subtotalAmountCents: number;
  readonly subtotalCurrency: string;
  readonly version: number;
  readonly lines: readonly OrderLineResult[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrderMutationResult {
  readonly orderId: string;
  readonly state: OrderState;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

import type { Order } from '../../domain/entities/order';
import type { OrderLine } from '../../domain/entities/order-line';

export function toOrderResult(order: Order, lines: readonly OrderLine[]): OrderResult {
  const p = order.properties;
  return {
    orderId: p.orderId.value,
    customerProfileId: p.customerProfileId.value,
    snapshotId: p.snapshotId.value,
    cartId: p.cartId.value,
    state: p.state,
    totalLines: p.totalLines,
    totalItems: p.totalItems,
    subtotalAmountCents: p.subtotalAmountCents,
    subtotalCurrency: p.subtotalCurrency,
    version: p.aggregateVersion.value,
    lines: lines.map(toOrderLineResult),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toOrderLineResult(line: OrderLine): OrderLineResult {
  const p = line.properties;
  return {
    orderLineId: p.orderLineId.value,
    cartLineId: p.cartLineId.value,
    skuId: p.skuId.value,
    productId: p.productId.value,
    skuCode: p.skuCode,
    quantity: p.quantity.value,
    unitPriceAmount: p.unitPrice.cents,
    unitPriceCurrency: p.unitPrice.currencyCode,
    snapshotTaxIncluded: p.snapshotTaxIncluded,
    revalidated: p.revalidated,
  };
}

export function toOrderMutationResult(order: Order): OrderMutationResult {
  const p = order.properties;
  return {
    orderId: p.orderId.value,
    state: p.state,
    totalLines: p.totalLines,
    totalItems: p.totalItems,
    version: p.aggregateVersion.value,
  };
}
