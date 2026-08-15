import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { InventoryMovementType } from '../value-objects/inventory-movement-type';

/**
 * WEMP-M05-SPEC-001 §10/§14 (decision D-09). Append-only primary quantity
 * ledger record. Every typed movement (D-04) produces one immutable
 * record: event type, SKU pool reference, delta, resulting onHand/reserved
 * snapshot, actor identity (logical UUIDv7), reason reference, correlation
 * ID, causation ID, timestamps, and aggregate version. No update/delete
 * API exists (append-only, D-09).
 *
 * Never stored: roles/permissions/policy internals, authentication
 * material, PII beyond logical identity references, monetary values
 * (A-17), and raw reason text (reason references only, non-disclosing).
 */
export interface InventoryMovementRecordProperties {
  readonly movementId: UuidV7;
  readonly stockPoolId: UuidV7;
  readonly movementType: InventoryMovementType;
  /** Applied delta magnitude (positive; direction is the movement type). */
  readonly delta: number;
  /** Resulting on-hand snapshot after this movement. */
  readonly resultingOnHand: number;
  /** Resulting reserved snapshot after this movement. */
  readonly resultingReserved: number;
  readonly actorIdentityId: UuidV7;
  /** Non-disclosing reason reference; mandatory on outward/correction movements (D-08). */
  readonly reasonReference?: string;
  readonly correlationId?: CorrelationIdentifier;
  readonly causationId?: UuidV7;
  readonly aggregateVersion: AggregateVersion;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

export class InventoryMovementRecord {
  public readonly properties: Readonly<InventoryMovementRecordProperties>;

  public constructor(properties: InventoryMovementRecordProperties) {
    if (!Number.isSafeInteger(properties.delta) || properties.delta <= 0) {
      throw new Error('Movement delta must be a positive safe integer');
    }
    if (!Number.isSafeInteger(properties.resultingOnHand) || properties.resultingOnHand < 0) {
      throw new Error('Resulting on-hand quantity must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(properties.resultingReserved) || properties.resultingReserved < 0) {
      throw new Error('Resulting reserved quantity must be a non-negative safe integer');
    }
    if (properties.resultingReserved > properties.resultingOnHand) {
      throw new Error('Resulting reserved quantity must not exceed resulting on-hand quantity');
    }
    if (properties.reasonReference?.trim().length === 0) {
      throw new Error('Reason reference must not be blank when provided');
    }
    if (properties.createdAt < properties.occurredAt) {
      throw new Error('Movement createdAt cannot precede occurredAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
