import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerOwnershipResolverPort } from '../../../authorization/application/ports/seller-ownership-resolver.port';
import { Module02SellerAuthorizationContractAdapter } from './module02-seller-authorization-contract.adapter';

const IDENTITY = new UuidV7('01913110-789a-7123-8123-000000000801');
const SELLER = new UuidV7('01913110-789a-7123-8123-000000000802');

function resolverMock(
  scope: SellerOwnershipResolverPort['resolveSellerScope'],
): jest.Mocked<SellerOwnershipResolverPort> {
  return {
    resolveSellerScope: scope,
  } as unknown as jest.Mocked<SellerOwnershipResolverPort>;
}

function activeApprovedScope(): NonNullable<
  Awaited<ReturnType<SellerOwnershipResolverPort['resolveSellerScope']>>
> {
  return {
    sellerProfileId: SELLER,
    organizationId: new UuidV7('01913110-789a-7123-8123-000000000803'),
    sellerState: 'APPROVED' as const,
    associationRole: 'OWNER' as const,
    associationState: 'ACTIVE' as const,
  };
}

describe('Module02SellerAuthorizationContractAdapter (M04-M4, WEMP-M04-AUTHZ-001 §4)', () => {
  it('resolves an ACTIVE association as facts for the owner scope', async () => {
    const adapter = new Module02SellerAuthorizationContractAdapter(
      resolverMock(jest.fn().mockResolvedValue(activeApprovedScope())),
    );

    const facts = await adapter.resolveActiveAssociation(IDENTITY, SELLER);

    expect(facts).toEqual({
      identityId: IDENTITY,
      sellerProfileId: SELLER,
      associationRole: 'OWNER',
      associationState: 'ACTIVE',
    });
  });

  it('resolves null when the identity has no association (fail closed)', async () => {
    const adapter = new Module02SellerAuthorizationContractAdapter(
      resolverMock(jest.fn().mockResolvedValue(null)),
    );

    await expect(adapter.resolveActiveAssociation(IDENTITY, SELLER)).resolves.toBeNull();
  });

  it('fails closed to null when the resolver raises (no silent grant)', async () => {
    const adapter = new Module02SellerAuthorizationContractAdapter(
      resolverMock(jest.fn().mockRejectedValue(new Error('storage unavailable'))),
    );

    await expect(adapter.resolveActiveAssociation(IDENTITY, SELLER)).resolves.toBeNull();
  });

  it('grants listing eligibility only to APPROVED/ACTIVE sellers with ACTIVE association (§26)', async () => {
    const adapter = new Module02SellerAuthorizationContractAdapter(
      resolverMock(jest.fn().mockResolvedValue(activeApprovedScope())),
    );

    await expect(adapter.isSellerEligibleToList(IDENTITY, SELLER)).resolves.toEqual({
      identityId: IDENTITY,
      eligible: true,
      sellerState: 'APPROVED',
    });
  });

  it('denies listing for an APPROVED seller with a REMOVED association (fail closed)', async () => {
    const scope = { ...activeApprovedScope(), associationState: 'REMOVED' as const };
    const adapter = new Module02SellerAuthorizationContractAdapter(
      resolverMock(jest.fn().mockResolvedValue(scope)),
    );

    await expect(adapter.isSellerEligibleToList(IDENTITY, SELLER)).resolves.toEqual({
      identityId: IDENTITY,
      eligible: false,
      sellerState: 'APPROVED',
    });
  });

  it('denies listing for a SUSPENDED seller even with an ACTIVE association', async () => {
    const scope = { ...activeApprovedScope(), sellerState: 'SUSPENDED' as const };
    const adapter = new Module02SellerAuthorizationContractAdapter(
      resolverMock(jest.fn().mockResolvedValue(scope)),
    );

    await expect(adapter.isSellerEligibleToList(IDENTITY, SELLER)).resolves.toEqual({
      identityId: IDENTITY,
      eligible: false,
      sellerState: 'SUSPENDED',
    });
  });

  it('denies listing when the resolver raises (fail closed, never a grant)', async () => {
    const adapter = new Module02SellerAuthorizationContractAdapter(
      resolverMock(jest.fn().mockRejectedValue(new Error('resolver down'))),
    );

    await expect(adapter.isSellerEligibleToList(IDENTITY, SELLER)).resolves.toEqual({
      identityId: IDENTITY,
      eligible: false,
    });
  });
});
