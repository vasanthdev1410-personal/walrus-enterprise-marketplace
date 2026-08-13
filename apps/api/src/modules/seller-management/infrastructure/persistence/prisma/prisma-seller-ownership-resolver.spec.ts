/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { UuidV7 } from '../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { PrismaSellerOwnershipResolver } from './prisma-seller-ownership-resolver';

const IDENTITY_ID = new UuidV7('01913110-789a-7123-8123-000000000001');
const SELLER_PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000002');
const ORGANIZATION_ID = new UuidV7('01913110-789a-7123-8123-000000000003');

const associationRow = {
  associationId: '01913110-789a-7123-8123-000000000004',
  sellerProfileId: SELLER_PROFILE_ID.value,
  identityId: IDENTITY_ID.value,
  associationRole: 'OWNER',
  isPrimary: true,
  state: 'ACTIVE',
};

const profileRow = {
  sellerProfileId: SELLER_PROFILE_ID.value,
  organizationId: ORGANIZATION_ID.value,
  state: 'ACTIVE',
  complianceState: 'COMPLIANT',
};

describe('PrismaSellerOwnershipResolver (D-11, WEMP-M03-AUTHZ-001 §4)', () => {
  it('resolves identity → ACTIVE association → seller scope', async () => {
    const prisma = {
      sellerIdentityAssociation: {
        findFirst: jest.fn().mockResolvedValue(associationRow),
      },
      sellerProfile: {
        findUnique: jest.fn().mockResolvedValue(profileRow),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaSellerOwnershipResolver(prisma).resolveSellerScope(
      IDENTITY_ID,
      SELLER_PROFILE_ID,
    );

    expect(scope).toEqual({
      sellerProfileId: SELLER_PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      sellerState: 'ACTIVE',
      associationRole: 'OWNER',
      associationState: 'ACTIVE',
    });
    expect(prisma.sellerIdentityAssociation.findFirst).toHaveBeenCalledWith({
      where: {
        identityId: IDENTITY_ID.value,
        sellerProfileId: SELLER_PROFILE_ID.value,
        state: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('resolves to null when the identity has no ACTIVE association (cross-seller access)', async () => {
    const prisma = {
      sellerIdentityAssociation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      sellerProfile: {
        findUnique: jest.fn().mockResolvedValue(profileRow),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaSellerOwnershipResolver(prisma).resolveSellerScope(
      IDENTITY_ID,
      SELLER_PROFILE_ID,
    );

    expect(scope).toBeNull();
    // The seller profile must never be consulted without a validated association.
    expect(prisma.sellerProfile.findUnique).not.toHaveBeenCalled();
  });

  it('resolves to null when a REMOVED association exists (inactive assignment)', async () => {
    const prisma = {
      sellerIdentityAssociation: {
        findFirst: jest.fn().mockResolvedValue({ ...associationRow, state: 'REMOVED' }),
      },
      sellerProfile: {
        findUnique: jest.fn().mockResolvedValue(profileRow),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaSellerOwnershipResolver(prisma).resolveSellerScope(
      IDENTITY_ID,
      SELLER_PROFILE_ID,
    );

    expect(scope).toBeNull();
  });

  it('resolves to null when the seller profile does not exist (forged seller id)', async () => {
    const prisma = {
      sellerIdentityAssociation: {
        findFirst: jest.fn().mockResolvedValue(associationRow),
      },
      sellerProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaSellerOwnershipResolver(prisma).resolveSellerScope(
      IDENTITY_ID,
      SELLER_PROFILE_ID,
    );

    expect(scope).toBeNull();
  });

  it('fails closed (null) when the storage lookup throws', async () => {
    const prisma = {
      sellerIdentityAssociation: {
        findFirst: jest.fn().mockRejectedValue(new Error('storage down')),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaSellerOwnershipResolver(prisma).resolveSellerScope(
      IDENTITY_ID,
      SELLER_PROFILE_ID,
    );

    expect(scope).toBeNull();
  });

  it('never resolves scope from a client-provided ownership claim', async () => {
    const prisma = {
      sellerIdentityAssociation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      sellerProfile: {
        findUnique: jest.fn().mockResolvedValue(profileRow),
      },
    } as unknown as PrismaService;

    // A caller claiming ownership of a seller it is not associated with:
    // the claimed seller id is only a lookup key — no association, no scope.
    const scope = await new PrismaSellerOwnershipResolver(prisma).resolveSellerScope(
      IDENTITY_ID,
      new UuidV7('01913110-789a-7123-8123-0000000000ff'),
    );

    expect(scope).toBeNull();
  });
});
