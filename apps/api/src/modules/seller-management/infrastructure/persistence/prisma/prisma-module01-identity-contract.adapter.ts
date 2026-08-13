import { Inject, Injectable } from '@nestjs/common';
import { UuidV7 } from '../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { IDENTITY_REPOSITORY } from '../../../../identity-authentication/infrastructure/persistence/prisma/prisma.module';
import type { IdentityRepository } from '../../../../identity-authentication/domain/identity/repositories/identity-repository';
import type {
  BoundaryIdentityState,
  BoundaryIdentityVerificationState,
  IdentityEligibility,
  Module01IdentityContractPort,
} from '../../../domain/ports/module-01-contract.port';

/**
 * WEMP-M03-CONTRACT-001 §A (decision D-04). Production adapter for the Module
 * 01 ↔ Module 03 identity contract. Module 03 never reads Module 01 storage
 * directly and never imports Module 01's state vocabulary: it consumes the
 * verified facts through Module 01's own approved identity repository
 * (injected by token) and maps them into the boundary types of this port.
 * Fail closed: any resolution error surfaces as an ineligible identity so
 * seller operations deny rather than proceed on unknown identity state.
 */
@Injectable()
export class PrismaModule01IdentityContractAdapter implements Module01IdentityContractPort {
  public constructor(
    @Inject(IDENTITY_REPOSITORY)
    private readonly identities: IdentityRepository,
  ) {}

  public async getIdentityEligibility(identityId: UuidV7): Promise<IdentityEligibility> {
    try {
      const snapshot = await this.identities.findAuthenticationById(identityId);
      if (snapshot === null) {
        return this.ineligible(identityId, 'DELETED', 'PENDING_VERIFICATION');
      }
      return {
        identityId,
        state: snapshot.identity.properties.identityState,
        verificationState: snapshot.identity.properties.verificationState,
      };
    } catch {
      return this.ineligible(identityId, 'DELETED', 'PENDING_VERIFICATION');
    }
  }

  private ineligible(
    identityId: UuidV7,
    state: BoundaryIdentityState,
    verificationState: BoundaryIdentityVerificationState,
  ): IdentityEligibility {
    return { identityId, state, verificationState };
  }
}
