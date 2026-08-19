import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { Order } from '../entities/order';
import type { OrderAuditRecord } from '../entities/order-audit-record';
import type { OrderLine } from '../entities/order-line';
import type { OrderStateTransition } from '../entities/order-state-transition';

/**
 * WEMP-M08-PLAN-001 M08-M2. Module 08-owned order aggregate repository.
 * All mutations are atomic change sets guarded by the aggregate version;
 * a stale version throws an optimistic-concurrency error without mutating
 * any state. Cross-module references (customerProfileId, skuId) are
 * logical UUIDv7 values — the repository never reads Module 04/05/06/07
 * storage. Port-only in M08-M1; the persistence adapter is implemented
 * in M08-M2.
 */
export interface OrderRepository {
  /** Find an order by its ID, or null if not found. */
  findById(orderId: UuidV7): Promise<Order | null>;
  /** Find the pending order for a customer profile, or null if none exists. */
  findPendingByCustomerProfileId(customerProfileId: UuidV7): Promise<Order | null>;
  /** Find all lines in an order. */
  findLines(orderId: UuidV7): Promise<readonly OrderLine[]>;
  /** Find all state transitions for an order. */
  findTransitions(orderId: UuidV7): Promise<readonly OrderStateTransition[]>;
  /** Find all audit records for an order. */
  findAuditRecords(orderId: UuidV7): Promise<readonly OrderAuditRecord[]>;
  /** Insert a new order with its initial change set. */
  insert(changeSet: OrderAggregateChangeSet): Promise<void>;
  /** Save an order change set with optimistic version guard. */
  save(changeSet: OrderAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
}

export interface OrderAggregateChangeSet {
  readonly order: Order;
  readonly linesToAppend: readonly OrderLine[];
  readonly transitionsToAppend: readonly OrderStateTransition[];
  readonly auditRecordsToAppend: readonly OrderAuditRecord[];
}
