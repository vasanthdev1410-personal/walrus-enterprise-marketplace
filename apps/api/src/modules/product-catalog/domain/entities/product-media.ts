import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { ProductMediaType } from '../value-objects/media-type';

/**
 * WEMP-M04-SPEC-001 §12/§17 (decisions D-09, D-16). Media reference + digest
 * record — the DB stores only an opaque storage reference and a SHA-256
 * digest; binary content lives in R2-compatible object storage with signed,
 * short-lived read references (ADR-008, Module 03 D-03 pattern). Content is
 * never logged and never persisted in the Module 04 database. Approved
 * allowlist: JPEG/PNG/WebP, <= 10 MB per file, <= 10 images per product.
 */
export interface ProductMediaProperties {
  readonly mediaId: UuidV7;
  readonly productId: UuidV7;
  readonly mediaType: ProductMediaType;
  /** Opaque object-storage reference; content lives in R2. */
  readonly mediaReference: string;
  /** SHA-256 hex digest of the stored object (verified before recording). */
  readonly mediaDigest: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedByIdentityId: UuidV7;
  readonly state: 'ACTIVE' | 'REMOVED';
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class ProductMedia {
  public readonly properties: Readonly<ProductMediaProperties>;

  public constructor(properties: ProductMediaProperties) {
    if (properties.mediaReference.trim().length === 0) {
      throw new Error('Media reference is required');
    }
    if (!/^[0-9a-f]{64}$/i.test(properties.mediaDigest)) {
      throw new Error('Media digest must be a SHA-256 hex digest');
    }
    if (properties.mimeType.trim().length === 0) {
      throw new Error('Media MIME type is required');
    }
    if (!Number.isSafeInteger(properties.sizeBytes) || properties.sizeBytes <= 0) {
      throw new Error('Media size must be a positive safe integer');
    }
    if (properties.sizeBytes > 10 * 1024 * 1024) {
      throw new Error('Media size must be at most 10 MB per file');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Media updatedAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
