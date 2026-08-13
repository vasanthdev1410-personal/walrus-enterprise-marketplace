import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-SPEC-001 §5/§12.5. Append-only KYC/KYB evidence record. The Module
 * 03 database stores only an opaque object reference and a SHA-256 digest of
 * the evidence — never file contents, never raw PII. Evidence is immutable
 * after submission (decision D-03 technical scope).
 */
export interface SellerVerificationEvidenceProperties {
  readonly evidenceId: UuidV7;
  readonly verificationId: UuidV7;
  readonly evidenceType: string;
  readonly evidenceReference: string;
  readonly evidenceDigest: string;
  readonly uploadedByIdentityId: UuidV7;
  readonly uploadedAt: Date;
  readonly createdAt: Date;
}

export class SellerVerificationEvidence {
  public readonly properties: Readonly<SellerVerificationEvidenceProperties>;

  public constructor(properties: SellerVerificationEvidenceProperties) {
    if (properties.evidenceReference.trim().length === 0) {
      throw new Error('Evidence reference is required');
    }
    if (!/^[0-9a-f]{64}$/i.test(properties.evidenceDigest)) {
      throw new Error('Evidence digest must be a SHA-256 hex digest');
    }
    if (properties.evidenceType.trim().length === 0) {
      throw new Error('Evidence type is required');
    }
    if (properties.createdAt < properties.uploadedAt) {
      throw new Error('Evidence createdAt cannot precede uploadedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}
