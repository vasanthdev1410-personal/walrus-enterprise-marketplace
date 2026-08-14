import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M04-SPEC-001 §12/§23 (decisions D-09, D-17). Media storage boundary.
 * The Module 04 database stores only opaque references and SHA-256 digests —
 * binary content lives in R2-compatible object storage with signed,
 * short-lived read references (ADR-008, Module 03 D-03 pattern). The
 * application layer never handles raw media bytes and never persists content.
 */
export interface StoredProductMedia {
  readonly mediaReference: string;
  readonly mediaDigest: string;
}

export interface ProductMediaStoragePort {
  /**
   * Verifies that the content stored under mediaReference hashes to
   * mediaDigest. Fail closed: any storage error or digest mismatch returns
   * false and the reference must not be recorded.
   */
  verifyMediaIntegrity(mediaReference: string, mediaDigest: string): Promise<boolean>;
  /**
   * Marks media content for deletion after retention expiry (D-17). Called
   * only by the retention processor after a legal-hold check passes and only
   * when an approved retention duration is configured — missing configuration
   * fails closed (nothing is deleted).
   */
  deleteMedia(mediaReference: string, productId: UuidV7): Promise<void>;
}
