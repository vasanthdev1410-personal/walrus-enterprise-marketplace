import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M04-SPEC-001 §24. Append-only Module 04 business audit event.
 * Records product lifecycle, variant, SKU, category, attribute, media, and
 * approval events. Never updated or deleted; authorization decisions remain
 * exclusively in Module 02 (AuthorizationDecisionRecord). Stores only
 * digests and opaque references — never raw media content and never PII.
 */
export interface ProductAuditRecordProperties {
  readonly auditEventId: UuidV7;
  readonly productId: UuidV7;
  readonly eventType: string;
  readonly actorIdentityId: UuidV7;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly correlationId?: CorrelationIdentifier;
  readonly evidenceDigest?: string;
}

export class ProductAuditRecord {
  public readonly properties: Readonly<ProductAuditRecordProperties>;

  public constructor(properties: ProductAuditRecordProperties) {
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
