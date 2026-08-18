import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { Cart } from '../entities/cart';
import type { CartLine } from '../entities/cart-line';

/**
 * WEMP-M07-PLAN-001. Write operations for the cart aggregate. All mutations
 * go through the application service which validates domain invariants
 * before calling the repository. The port abstracts persistence so M07-M2
 * can wire the Prisma adapter without changing application logic.
 */
export interface CartWritePort {
  /** Create a new cart for a customer profile. */
  createCart(cart: Cart): Promise<void>;
  /** Save a cart with optimistic version guard. */
  saveCart(cart: Cart, expectedVersion: AggregateVersion): Promise<void>;
  /** Add a line to a cart. */
  addLine(cart: Cart, line: CartLine, expectedVersion: AggregateVersion): Promise<void>;
  /** Update a line in a cart. */
  updateLine(cart: Cart, line: CartLine, expectedVersion: AggregateVersion): Promise<void>;
  /** Remove a line from a cart (soft remove — auditable). */
  removeLine(cart: Cart, lineId: UuidV7, expectedVersion: AggregateVersion): Promise<void>;
  /** Remove all lines from a cart (clear cart). */
  clearCart(cart: Cart, expectedVersion: AggregateVersion): Promise<void>;
}
