import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  InventorySellerAssociationFacts,
  Module02InventoryAuthorizationContractPort,
} from '../../domain/ports/module-02-authorization.port';

/**
 * WEMP-M05-AUTHZ-001 (decisions D-05/A-09, Gate #1 RECORDED 2026-08-15).
 * Fail-closed Module 02 ↔ Module 05 ownership contract wiring for M05-M3:
 * no association is ever resolved, so every seller inventory operation is
 * denied until M05-M4 wires the real Module 02 inventory ownership resolver
 * (the approved third resource scope). Any missing wiring must never
 * surface as a grant — deny is the only safe default (A-02/A-07).
 */
@Injectable()
export class FailClosedModule02InventoryAuthorizationAdapter implements Module02InventoryAuthorizationContractPort {
  public resolveActiveAssociation(
    identityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<InventorySellerAssociationFacts | null> {
    void identityId;
    void sellerProfileId;
    return Promise.resolve(null);
  }
}
