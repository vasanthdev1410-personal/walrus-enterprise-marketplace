import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { Cart } from '../entities/cart';
import type { CartAuditRecord } from '../entities/cart-audit-record';
import type { CartLine } from '../entities/cart-line';
import type { CartStateTransition } from '../entities/cart-state-transition';

/**
 * WEMP-M07-PLAN-001 M07-M2. Module 07-owned cart aggregate repository.
 * All mutations are atomic change sets guarded by the aggregate version;
 * a stale version throws an optimistic-concurrency error without mutating
 * any state. Cross-module references (customerProfileId, skuId) are
 * logical UUIDv7 values — the repository never reads Module 04/05/06
 * storage. Port-only in M07-M1; the persistence adapter is implemented
 * in M07-M2.
 */
export interface CartRepository {
  /** Find the active cart for a customer profile, or null if none exists. */
  findActiveByCustomerProfileId(customerProfileId: UuidV7): Promise<Cart | null>;
  /** Find a cart by its ID, or null if not found. */
  findById(cartId: UuidV7): Promise<Cart | null>;
  /** Find all lines in a cart. */
  findLines(cartId: UuidV7): Promise<readonly CartLine[]>;
  /** Find all state transitions for a cart. */
  findTransitions(cartId: UuidV7): Promise<readonly CartStateTransition[]>;
  /** Find all audit records for a cart. */
  findAuditRecords(cartId: UuidV7): Promise<readonly CartAuditRecord[]>;
  /** Insert a new cart with its initial change set. */
  insert(changeSet: CartAggregateChangeSet): Promise<void>;
  /** Save a cart change set with optimistic version guard. */
  save(changeSet: CartAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
}

export interface CartAggregateChangeSet {
  readonly cart: Cart;
  readonly linesToAppend: readonly CartLine[];
  readonly linesToUpdate: readonly CartLine[];
  readonly linesToRemove: readonly UuidV7[];
  readonly transitionsToAppend: readonly CartStateTransition[];
  readonly auditRecordsToAppend: readonly CartAuditRecord[];
}
