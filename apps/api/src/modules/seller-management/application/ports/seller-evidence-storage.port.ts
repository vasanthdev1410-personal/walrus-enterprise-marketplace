import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M03-SPEC-001 §12.5/§12.6 / decision D-03. Evidence storage boundary.
 * The Module 03 database stores only opaque references and SHA-256 digests —
 * file contents live in protected object storage with signed short-lived read
 * references. This port abstracts storage; the application layer never handles
 * raw document bytes.
 */
export interface StoredSellerEvidence {
  readonly evidenceReference: string;
  readonly evidenceDigest: string;
}

export interface SellerEvidenceStoragePort {
  /**
   * Verifies that the content stored under evidenceReference hashes to
   * evidenceDigest. Fail closed: any storage error or digest mismatch returns
   * false and the evidence must not be recorded.
   */
  verifyEvidenceIntegrity(evidenceReference: string, evidenceDigest: string): Promise<boolean>;
  /**
   * Marks evidence content for deletion after retention expiry. Called only by
   * the retention processor after a legal-hold check passes. Deleting the
   * object reference is audit-trailed; the DB metadata row remains append-only.
   */
  deleteEvidence(evidenceReference: string, sellerProfileId: UuidV7): Promise<void>;
}
