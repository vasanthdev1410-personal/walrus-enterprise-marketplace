import { Inject, Injectable } from '@nestjs/common';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerOwnershipResolverPort } from '../../../authorization/application/ports/seller-ownership-resolver.port';
import { SELLER_OWNERSHIP_RESOLVER } from '../../../authorization/authorization.tokens';
import type {
  Module02SellerAuthorizationContractPort,
  SellerAssociationFacts,
  SellerEligibility,
} from '../../domain/ports/module-02-03-contract.port';

/**
 * WEMP-M04-CONTRACT-001 Part A / decisions D-01, D-11. The Module 02/03 ↔
 * Module 04 seller/catalog contract adapter. Module 04 never reads Module
 * 01/02/03 storage and never evaluates roles itself: association facts and
 * seller eligibility are consumed through the approved Module 02 ownership
 * resolver (the second ownership-resolver scope, WEMP-M04-AUTHZ-001 §4 —
 * Module 02 owner sign-off 2026-08-14). Fail closed: any resolver error or
 * missing association resolves to null / ineligible — never a grant.
 *
 * Listing gate (WEMP-M04-SPEC-001 §26): only an APPROVED or ACTIVE seller
 * with an ACTIVE SellerIdentityAssociation may list products. Any other
 * seller state (DRAFT, SUBMITTED, UNDER_REVIEW, CORRECTIONS_REQUESTED,
 * SUSPENDED, REJECTED, CLOSED) fails closed.
 */
@Injectable()
export class Module02SellerAuthorizationContractAdapter implements Module02SellerAuthorizationContractPort {
  public constructor(
    @Inject(SELLER_OWNERSHIP_RESOLVER)
    private readonly resolver: SellerOwnershipResolverPort,
  ) {}

  public async resolveActiveAssociation(
    identityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<SellerAssociationFacts | null> {
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

  public async isSellerEligibleToList(
    identityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<SellerEligibility> {
    try {
      const scope = await this.resolver.resolveSellerScope(identityId, sellerProfileId);
      if (scope === null) {
        return { identityId, eligible: false };
      }
      const sellerApproved = scope.sellerState === 'APPROVED' || scope.sellerState === 'ACTIVE';
      const associationActive = scope.associationState === 'ACTIVE';
      return {
        identityId,
        eligible: sellerApproved && associationActive,
        sellerState: scope.sellerState,
      };
    } catch {
      // Fail closed: any error denies listing.
      return { identityId, eligible: false };
    }
  }
}
