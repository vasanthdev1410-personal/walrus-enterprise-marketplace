import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerEvidenceLegalHold } from '../entities/seller-evidence-legal-hold';

/**
 * WEMP-M03-SPEC-001 / decision D-03. Legal-hold persistence. An authorized
 * legal hold prevents automatic retention processing (expiry/deletion) of a
 * seller's evidence while active. The repository is append/update-only for the
 * hold lifecycle (place → release); holds are never deleted.
 */
export interface SellerLegalHoldRepository {
  findActiveBySellerProfileId(sellerProfileId: UuidV7): Promise<SellerEvidenceLegalHold | null>;
  insert(hold: SellerEvidenceLegalHold): Promise<void>;
  save(hold: SellerEvidenceLegalHold): Promise<void>;
}
