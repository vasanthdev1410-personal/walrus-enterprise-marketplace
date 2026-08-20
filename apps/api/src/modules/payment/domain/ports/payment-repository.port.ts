import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { Payment } from '../entities/payment';
import type { PaymentAuditRecord } from '../entities/payment-audit-record';
import type { PaymentAttempt } from '../entities/payment-attempt';
import type { PaymentRefund } from '../entities/payment-refund';
import type { PaymentStateTransition } from '../entities/payment-state-transition';

/**
 * WEMP-M09-PLAN-001 M09-M2. Module 09-owned payment aggregate repository.
 * All mutations are atomic change sets guarded by the aggregate version;
 * a stale version throws an optimistic-concurrency error without mutating
 * any state. Cross-module references (orderId, customerProfileId) are
 * logical UUIDv7 values — the repository never reads Module 06/08 storage.
 * Port-only in M09-M1; the persistence adapter is implemented in M09-M2.
 */
export interface PaymentRepository {
  /** Find a payment by its ID, or null if not found. */
  findById(paymentId: UuidV7): Promise<Payment | null>;
  /** Find a payment by order ID, or null if none exists. */
  findByOrderId(orderId: UuidV7): Promise<Payment | null>;
  /** Find a payment by idempotency key, or null if none exists. */
  findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null>;
  /** Find all attempts for a payment. */
  findAttempts(paymentId: UuidV7): Promise<readonly PaymentAttempt[]>;
  /** Find all state transitions for a payment. */
  findTransitions(paymentId: UuidV7): Promise<readonly PaymentStateTransition[]>;
  /** Find all audit records for a payment. */
  findAuditRecords(paymentId: UuidV7): Promise<readonly PaymentAuditRecord[]>;
  /** Find all refunds for a payment. */
  findRefunds(paymentId: UuidV7): Promise<readonly PaymentRefund[]>;
  /** Insert a new payment with its initial change set. */
  insert(changeSet: PaymentAggregateChangeSet): Promise<void>;
  /** Save a payment change set with optimistic version guard. */
  save(changeSet: PaymentAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
}

export interface PaymentAggregateChangeSet {
  readonly payment: Payment;
  readonly attemptsToAppend: readonly PaymentAttempt[];
  readonly transitionsToAppend: readonly PaymentStateTransition[];
  readonly auditRecordsToAppend: readonly PaymentAuditRecord[];
  readonly refundsToAppend: readonly PaymentRefund[];
}
