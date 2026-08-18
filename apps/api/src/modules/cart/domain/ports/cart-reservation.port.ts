import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M07-SPEC-001 (decision D-06). The cart-level reservation port
 * wraps the M05 InventoryReservationPort for cart-specific use. Reserves
 * at add-to-cart (quantity change = adjust delta reservation). Releases
 * on cart clear, line remove, cart expiry, or checkout handoff. Uses
 * M05's 15-minute TTL.
 *
 * Port-only in M07-M1; the adapter wiring happens in M07-M3.
 */
export type CartReservationResult =
  | {
      readonly outcome: 'RESERVED';
      readonly skuId: UuidV7;
      readonly quantity: number;
      readonly availableQuantity: number;
    }
  | { readonly outcome: 'DENIED'; readonly skuId: UuidV7; readonly reason: string }
  | { readonly outcome: 'FAILED'; readonly skuId: UuidV7; readonly reason: string };

export interface CartReservationRequest {
  readonly skuId: UuidV7;
  readonly quantity: number;
  readonly correlationId?: string;
}

export interface CartReservationPort {
  reserve(request: CartReservationRequest): Promise<CartReservationResult>;
  release(request: CartReservationRequest): Promise<CartReservationResult>;
}
