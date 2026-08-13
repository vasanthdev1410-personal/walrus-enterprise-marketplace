import { Injectable } from '@nestjs/common';
import { UuidV7 } from '../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  SellerOwnershipResolverPort,
  SellerScopeResolution,
} from '../../../../authorization/application/ports/seller-ownership-resolver.port';
import { PrismaService } from '../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';

/**
 * WEMP-M03-AUTHZ-001 §4 / WEMP-M03-CONTRACT-001 §B.3 (approved D-11). The
 * first resource-ownership resolver implementation. Module 02 evaluates;
 * Module 03 owns the association facts. Resolves
 *
 *   identity → SellerIdentityAssociation (ACTIVE) → seller profile → scope
 *
 * against authoritative Module 03 storage. The caller's claimed seller
 * profile identifier is never trusted: it is only a lookup key validated
 * against the association store. Fail closed — any lookup error resolves to
 * null so the requesting decision denies.
 */
@Injectable()
export class PrismaSellerOwnershipResolver implements SellerOwnershipResolverPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async resolveSellerScope(
    identityId: UuidV7,
    sellerProfileId: UuidV7,
  ): Promise<SellerScopeResolution | null> {
    try {
      const association = await this.prisma.sellerIdentityAssociation.findFirst({
        where: {
          identityId: identityId.value,
          sellerProfileId: sellerProfileId.value,
          state: 'ACTIVE',
        },
        orderBy: { createdAt: 'asc' },
      });
      if (association === null) {
        return null;
      }
      // Defense in depth: never trust the query filter alone — a non-ACTIVE
      // association must never contribute seller scope (fail closed).
      if (association.state !== 'ACTIVE') {
        return null;
      }
      const profile = await this.prisma.sellerProfile.findUnique({
        where: { sellerProfileId: sellerProfileId.value },
      });
      if (profile === null) {
        return null;
      }
      return {
        sellerProfileId,
        organizationId: new UuidV7(profile.organizationId),
        sellerState: profile.state,
        associationRole: association.associationRole,
        associationState: association.state,
      };
    } catch {
      // Fail closed: a storage/validation error must never surface as a grant.
      return null;
    }
  }
}
