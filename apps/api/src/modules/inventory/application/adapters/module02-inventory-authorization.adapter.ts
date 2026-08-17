import { Inject, Injectable } from '@nestjs/common';
import type { SellerOwnershipResolverPort } from '../../../authorization/application/ports/seller-ownership-resolver.port';
import { SELLER_OWNERSHIP_RESOLVER } from '../../../authorization/authorization.tokens';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  InventorySellerAssociationFacts,
  Module02InventoryAuthorizationContractPort,
} from '../../domain/ports/module-02-authorization.port';

/**
 * WEMP-M05-AUTHZ-001 §4 (decision D-05/A-09, Module 02 owner sign-off
 * RECORDED 2026-08-15; M05-M4). The real Module 02 ↔ Module 05 inventory
 * ownership contract: the approved third ownership-resolver scope,
 * resolved against the seller organization owning the target SKU. Module
 * 05 never evaluates roles itself and never reads Module 02/03 storage
 * (A-02): the caller's ACTIVE association is resolved through the Module
 * 02 `SELLER_OWNERSHIP_RESOLVER` (implemented by Module 03 over its
 * authoritative association store) and returned as facts. Fail closed:
 * any resolver error, missing association, or malformed scope resolves to
 * null — never a grant. No client-supplied ownership claims are ever
 * trusted (scope is always resolved server-side).
 */
@Injectable()
export class Module02InventoryAuthorizationAdapter implements Module02InventoryAuthorizationContractPort {
  public constructor(
    @Inject(SELLER_OWNERSHIP_RESOLVER)
    private readonly resolver: SellerOwnershipResolverPort,
  ) {}

  public async resolveActiveAssociation(
    identityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<InventorySellerAssociationFacts | null> {
    try {
      const scope = await this.resolver.resolveSellerScope(identityId, sellerProfileId);
      if (scope === null) {
        return null;
      }
      return {
        identityId,
        sellerProfileId,
        associationRole: scope.associationRole,
        associationState: scope.associationState,
      };
    } catch {
      // Fail closed: a resolver/storage failure must never surface as a grant.
      return null;
    }
  }
}
