import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M05-SPEC-001 §10/§14 (decision D-09). Append-only secondary
 * business audit record for non-quantity events (pool activation/closure,
 * admin visibility events, config/threshold changes), mirroring
 * `ProductAuditRecord` (Module 04 §24). Never updated or deleted;
 * authorization decisions remain exclusively in Module 02
 * (AuthorizationDecisionRecord). Stores only digests and opaque
 * references — never raw content and never PII.
 */
export interface InventoryAuditRecordProperties {
  readonly auditEventId: UuidV7;
  readonly stockPoolId: UuidV7;
  readonly eventType: string;
  readonly actorIdentityId: UuidV7;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly correlationId?: CorrelationIdentifier;
  readonly evidenceDigest?: string;
}

export class InventoryAuditRecord {
  public readonly properties: Readonly<InventoryAuditRecordProperties>;

  public constructor(properties: InventoryAuditRecordProperties) {
    if (properties.eventType.trim().length === 0) {
      throw new Error('Audit event type is required');
    }
    if (
      properties.evidenceDigest !== undefined &&
      !/^[0-9a-f]{64}$/i.test(properties.evidenceDigest)
    ) {
      throw new Error('Audit evidence digest must be a SHA-256 hex digest');
    }
    if (properties.createdAt < properties.occurredAt) {
      throw new Error('Audit createdAt cannot precede occurredAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
