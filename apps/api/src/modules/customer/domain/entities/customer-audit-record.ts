import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M06-SPEC-001 §10 (decision D-08). Append-only Module 06 business
 * audit event. Records customer lifecycle, address, business-profile, and
 * preference events. Never updated or deleted; authorization decisions remain
 * exclusively in Module 02. Stores only digests and opaque references — never
 * raw registration numbers, raw address data, PII beyond logical identity
 * references, authentication material, or monetary values.
 */
export interface CustomerAuditRecordProperties {
  readonly auditEventId: UuidV7;
  readonly customerProfileId: UuidV7;
  readonly eventType: string;
  readonly actorIdentityId: UuidV7;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly correlationId?: CorrelationIdentifier;
  readonly evidenceDigest?: string;
}

export class CustomerAuditRecord {
  public readonly properties: Readonly<CustomerAuditRecordProperties>;

  public constructor(properties: CustomerAuditRecordProperties) {
    if (properties.eventType.trim().length === 0) {
      throw new Error('Customer audit event type is required');
    }
    if (
      properties.evidenceDigest !== undefined &&
      !/^[0-9a-f]{64}$/i.test(properties.evidenceDigest)
    ) {
      throw new Error('Customer audit evidence digest must be a SHA-256 hex digest');
    }
    if (properties.createdAt < properties.occurredAt) {
      throw new Error('Customer audit createdAt cannot precede occurredAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
