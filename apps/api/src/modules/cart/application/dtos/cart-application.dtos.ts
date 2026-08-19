/**
 * WEMP-M07-PLAN-001 M07-M3. Application-layer DTOs for the cart module:
 * command objects for mutations, query objects for reads, and result objects
 * returned by the application service. These are the API-level contracts
 * that M07-M5 controllers will consume; the application service translates
 * between DTOs and domain entities.
 */
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { CartState } from '../../domain/value-objects/cart-state';

// ---------------------------------------------------------------------------
// Commands (mutations)
// ---------------------------------------------------------------------------

/** Creates a new cart for a customer profile. Called when no active cart exists. */
export interface CreateCartCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

/** Adds an item (SKU) to the customer's active cart. */
export interface AddCartItemCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly skuId: UuidV7;
  readonly productId: UuidV7;
  readonly skuCode: string;
  readonly quantity: number;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

/** Updates the quantity of an existing line in the customer's active cart. */
export interface UpdateCartItemQuantityCommand {
  readonly customerProfileId: UuidV7;
  readonly cartLineId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly quantity: number;
  readonly expectedVersion: number;
  readonly correlationId?: CorrelationIdentifier;
}

/** Removes a line from the customer's active cart. */
export interface RemoveCartItemCommand {
  readonly customerProfileId: UuidV7;
  readonly cartLineId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly correlationId?: CorrelationIdentifier;
}

/** Clears all lines from the customer's active cart. */
export interface ClearCartCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

/** Hands off the cart to Module 08 orders as an immutable snapshot. */
export interface CheckoutHandoffCommand {
  readonly customerProfileId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationIdentifier;
}

// ---------------------------------------------------------------------------
// Commands (expiry — system actor)
// ---------------------------------------------------------------------------

/** Expires a single cart (system actor, AUTO_EXPIRED transition). */
export interface ExpireCartCommand {
  readonly cartId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly reasonReference: string;
  readonly correlationId?: CorrelationIdentifier;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface CartLineResult {
  readonly cartLineId: string;
  readonly skuId: string;
  readonly productId: string;
  readonly skuCode: string;
  readonly quantity: number;
  readonly unitPriceAmount: number;
  readonly unitPriceCurrency: string;
  readonly snapshotTaxIncluded: boolean;
  readonly productUnavailable: boolean;
}

export interface CartResult {
  readonly cartId: string;
  readonly customerProfileId: string;
  readonly state: CartState;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly version: number;
  readonly lines: readonly CartLineResult[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
}

export interface CheckoutHandoffResult {
  readonly cartId: string;
  readonly snapshotId: string;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly subtotalAmountCents: number;
  readonly subtotalCurrency: string;
  readonly version: number;
}

export interface CartMutationResult {
  readonly cartId: string;
  readonly state: CartState;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

import type { Cart } from '../../domain/entities/cart';
import type { CartLine } from '../../domain/entities/cart-line';
import type { CartSnapshot } from '../../domain/value-objects/cart-snapshot';

export function toCartResult(cart: Cart, lines: readonly CartLine[]): CartResult {
  const p = cart.properties;
  return {
    cartId: p.cartId.value,
    customerProfileId: p.customerProfileId.value,
    state: p.state,
    totalLines: p.totalLines,
    totalItems: p.totalItems,
    version: p.aggregateVersion.value,
    lines: lines.map(toCartLineResult),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    ...(p.expiresAt !== undefined ? { expiresAt: p.expiresAt.toISOString() } : {}),
  };
}

export function toCartLineResult(line: CartLine): CartLineResult {
  const p = line.properties;
  return {
    cartLineId: p.cartLineId.value,
    skuId: p.skuId.value,
    productId: p.productId.value,
    skuCode: p.skuCode,
    quantity: p.quantity.value,
    unitPriceAmount: p.unitPrice.cents,
    unitPriceCurrency: p.unitPrice.currencyCode,
    snapshotTaxIncluded: p.snapshotTaxIncluded,
    productUnavailable: p.productUnavailable,
  };
}

export function toCheckoutHandoffResult(cart: Cart, snapshot: CartSnapshot): CheckoutHandoffResult {
  return {
    cartId: cart.properties.cartId.value,
    snapshotId: snapshot.properties.snapshotId.value,
    totalLines: snapshot.properties.totalLines,
    totalItems: snapshot.properties.totalItems,
    subtotalAmountCents: snapshot.properties.subtotalAmount.cents,
    subtotalCurrency: snapshot.properties.subtotalAmount.currencyCode,
    version: cart.properties.aggregateVersion.value,
  };
}

export function toCartMutationResult(cart: Cart): CartMutationResult {
  const p = cart.properties;
  return {
    cartId: p.cartId.value,
    state: p.state,
    totalLines: p.totalLines,
    totalItems: p.totalItems,
    version: p.aggregateVersion.value,
  };
}
