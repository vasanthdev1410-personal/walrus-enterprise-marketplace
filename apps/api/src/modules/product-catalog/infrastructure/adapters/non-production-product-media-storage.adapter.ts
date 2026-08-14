import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { ProductMediaStoragePort } from '../../application/ports/product-media-storage.port';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const MAX_REFERENCE_LENGTH = 1024;

/**
 * WEMP-M04-SPEC-001 §12/§23 (decisions D-09, D-17) — NON-PRODUCTION adapter.
 *
 * The approved media architecture stores binary content in R2-compatible
 * object storage with signed short-lived read references; the Module 04
 * database stores only opaque references and SHA-256 digests (ADR-008,
 * Module 03 evidence pattern). Until the approved object-storage boundary is
 * integrated, this adapter enforces the same DB-level invariants the
 * production boundary will rely on — well-formed references and SHA-256 hex
 * digests — and fails closed on anything malformed. It never handles or
 * persists media contents, matching every other non-production adapter in
 * this repository.
 *
 * Retention (D-17): deletion is a no-op here (no object store); the
 * production retention processor only deletes after an approved retention
 * duration is configured and a legal-hold check passes — missing
 * configuration fails closed (nothing is deleted).
 */
@Injectable()
export class NonProductionProductMediaStorageAdapter implements ProductMediaStoragePort {
  public verifyMediaIntegrity(mediaReference: string, mediaDigest: string): Promise<boolean> {
    if (mediaReference.trim().length === 0 || mediaReference.length > MAX_REFERENCE_LENGTH) {
      return Promise.resolve(false);
    }
    if (!SHA256_HEX_PATTERN.test(mediaDigest)) {
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  public deleteMedia(mediaReference: string, productId: UuidV7): Promise<void> {
    // Non-production: there is no object store to delete from. The caller
    // (retention processor) only deletes after retention + legal-hold checks.
    void mediaReference;
    void productId;
    return Promise.resolve();
  }
}
