import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerEvidenceStoragePort } from '../../application/ports/seller-evidence-storage.port';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const MAX_REFERENCE_LENGTH = 1024;

/**
 * WEMP-M03-SPEC-001 §12.5/§12.6 / decision D-03 — NON-PRODUCTION adapter.
 *
 * The approved evidence architecture stores document bytes in protected object
 * storage with signed short-lived read references; the Module 03 database
 * stores only opaque references and SHA-256 digests. Until the approved object
 * storage boundary is integrated, this adapter enforces the same DB-level
 * invariants the production boundary will rely on — well-formed references and
 * SHA-256 hex digests — and fails closed on anything malformed. It never
 * handles or persists document contents, matching every other non-production
 * adapter in this repository.
 *
 * A real integration replaces this adapter through the SELLER_EVIDENCE_STORAGE
 * token; the application layer is unaffected.
 */
@Injectable()
export class NonProductionSellerEvidenceStorageAdapter implements SellerEvidenceStoragePort {
  public verifyEvidenceIntegrity(
    evidenceReference: string,
    evidenceDigest: string,
  ): Promise<boolean> {
    if (evidenceReference.trim().length === 0 || evidenceReference.length > MAX_REFERENCE_LENGTH) {
      return Promise.resolve(false);
    }
    if (!SHA256_HEX_PATTERN.test(evidenceDigest)) {
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  public deleteEvidence(evidenceReference: string, sellerProfileId: UuidV7): Promise<void> {
    // Non-production: there is no object store to delete from. The caller
    // (retention processor) only deletes after retention + legal-hold checks.
    void evidenceReference;
    void sellerProfileId;
    return Promise.resolve();
  }
}
