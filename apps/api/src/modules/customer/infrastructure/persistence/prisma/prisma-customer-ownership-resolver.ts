import { Injectable } from '@nestjs/common';
import { UuidV7 } from '../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import type {
  CustomerOwnershipResolverPort,
  CustomerScopeResolution,
} from '../../../../authorization/application/ports/customer-ownership-resolver.port';

/**
 * WEMP-M06-AUTHZ-001 §4 (decision D-07; Module 02 owner sign-off RECORDED
 * 2026-08-17). The fourth resource-ownership resolver implementation —
 * customer identity scope. Module 02 evaluates; Module 06 owns the
 * customer-profile facts. Resolves
 *
 *   identity → CustomerProfile.identityId → scope
 *
 * against authoritative Module 06 storage. The caller's claimed customer
 * profile identifier is never trusted: it is only a lookup key validated
 * against the CustomerProfile store — the profile must exist AND its
 * identityId must equal the caller's authenticated Identity. Fail closed —
 * any lookup error, missing profile, or identity mismatch resolves to null
 * so the requesting decision denies. Never reads Module 01 or Module 02
 * storage (A-06).
 */
@Injectable()
export class PrismaCustomerOwnershipResolver implements CustomerOwnershipResolverPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async resolveCustomerScope(
    identityId: UuidV7,
    customerProfileId: UuidV7,
  ): Promise<CustomerScopeResolution | null> {
    try {
      const profile = await this.prisma.customerProfile.findUnique({
        where: { customerProfileId: customerProfileId.value },
      });
      if (profile === null) {
        return null;
      }
      // The identity must own the profile — never trust the lookup alone.
      if (profile.identityId !== identityId.value) {
        return null;
      }
      return {
        customerProfileId,
        identityId,
        customerState: profile.state,
      };
    } catch {
      // Fail closed: a storage/validation error must never surface as a grant.
      return null;
    }
  }
}
