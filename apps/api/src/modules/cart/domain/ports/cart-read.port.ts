import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M07-PLAN-001. Minimal, fail-closed cart facts for future M08
 * (orders) consumption. Only ACTIVE carts resolve to facts; unknown,
 * CHECKED_OUT, ARCHIVED, or AUTO_EXPIRED carts resolve to deny (null) —
 * consuming modules treat null as an authorization failure.
 * Port-only in M07-M1; the shape becomes normative at M08's spec approval.
 */
export interface CartReadResult {
  readonly cartId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly totalLines: number;
  readonly totalItems: number;
}

export interface CartReadPort {
  /**
   * Resolves an ACTIVE cart by its cartId, or null when the cart is
   * unknown or in a terminal state (fail closed).
   */
  resolveActiveCart(cartId: UuidV7): Promise<CartReadResult | null>;
  /**
   * Resolves the ACTIVE cart for a customer profile, or null when no
   * active cart exists for that customer (fail closed).
   */
  findActiveCartByCustomer(customerProfileId: UuidV7): Promise<CartReadResult | null>;
}
