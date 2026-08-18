import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M07-SPEC-001 (decisions D-11/D-12/D-13). Append-only Module 07
 * business audit event. Records cart lifecycle events (created, item
 * added, item removed, checked out, expired). Never updated or deleted;
 * authorization decisions remain exclusively in Module 02. Stores only
 * digests and opaque references — never PII, authentication material,
 * or raw monetary values.
 */
export interface CartAuditRecordProperties {
  readonly auditEventId: UuidV7;
  readonly cartId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly eventType: string;
  readonly actorIdentityId: UuidV7;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly correlationId?: CorrelationIdentifier;
  readonly evidenceDigest?: string;
}

export class CartAuditRecord {
  public readonly properties: Readonly<CartAuditRecordProperties>;

  public constructor(properties: CartAuditRecordProperties) {
    if (properties.eventType.trim().length === 0) {
      throw new Error('Cart audit event type is required');
    }
    if (
      properties.evidenceDigest !== undefined &&
      !/^[0-9a-f]{64}$/i.test(properties.evidenceDigest)
    ) {
      throw new Error('Cart audit evidence digest must be a SHA-256 hex digest');
    }
    if (properties.createdAt < properties.occurredAt) {
      throw new Error('Cart audit createdAt cannot precede occurredAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
