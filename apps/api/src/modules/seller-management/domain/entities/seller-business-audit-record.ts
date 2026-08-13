import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-SPEC-001 §12.9 / decision D-03. Append-only Module 03 business
 * audit event. Records seller lifecycle, verification, evidence, retention,
 * member and agreement events. Never updated or deleted; authorization
 * decisions remain exclusively in Module 02. Stores only digests and opaque
 * references — never raw KYC/KYB document content and never PII.
 */
export interface SellerBusinessAuditRecordProperties {
  readonly auditEventId: UuidV7;
  readonly sellerProfileId: UuidV7;
  readonly eventType: string;
  readonly actorIdentityId: UuidV7;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly correlationId?: CorrelationIdentifier;
  readonly evidenceDigest?: string;
}

export class SellerBusinessAuditRecord {
  public readonly properties: Readonly<SellerBusinessAuditRecordProperties>;

  public constructor(properties: SellerBusinessAuditRecordProperties) {
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
