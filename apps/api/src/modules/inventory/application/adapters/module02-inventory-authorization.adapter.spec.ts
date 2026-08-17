import type { SellerOwnershipResolverPort } from '../../../authorization/application/ports/seller-ownership-resolver.port';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Module02InventoryAuthorizationAdapter } from './module02-inventory-authorization.adapter';

const IDENTITY = new UuidV7('01913110-789a-7123-8123-000000000801');
const SELLER = new UuidV7('01913110-789a-7123-8123-000000000802');

function resolverMock(
  scope: Awaited<ReturnType<SellerOwnershipResolverPort['resolveSellerScope']>>,
): jest.Mocked<SellerOwnershipResolverPort> {
  return {
    resolveSellerScope: jest.fn().mockResolvedValue(scope),
  };
}

function failingResolverMock(): jest.Mocked<SellerOwnershipResolverPort> {
  return {
    resolveSellerScope: jest.fn().mockRejectedValue(new Error('storage unavailable')),
  };
}

function ownerScope(): NonNullable<
  Awaited<ReturnType<SellerOwnershipResolverPort['resolveSellerScope']>>
> {
  return {
    sellerProfileId: SELLER,
    organizationId: new UuidV7('01913110-789a-7123-8123-000000000803'),
    sellerState: 'ACTIVE' as const,
    associationRole: 'OWNER' as const,
    associationState: 'ACTIVE' as const,
  };
}

describe('Module02InventoryAuthorizationAdapter (M05-M4, WEMP-M05-AUTHZ-001 §4 third scope)', () => {
  it('resolves the ACTIVE OWNER association as facts for the owning seller', async () => {
    const adapter = new Module02InventoryAuthorizationAdapter(resolverMock(ownerScope()));

    const facts = await adapter.resolveActiveAssociation(IDENTITY, SELLER);

    expect(facts).toEqual({
      identityId: IDENTITY,
      sellerProfileId: SELLER,
      associationRole: 'OWNER',
      associationState: 'ACTIVE',
    });
    expect(facts?.associationRole).toBe('OWNER');
  });

  it('carries MEMBER associations as read-only facts (M05-M3 D-05 semantics)', async () => {
    const scope = { ...ownerScope(), associationRole: 'MEMBER' as const };
    const adapter = new Module02InventoryAuthorizationAdapter(resolverMock(scope));

    const facts = await adapter.resolveActiveAssociation(IDENTITY, SELLER);
    expect(facts?.associationRole).toBe('MEMBER');
  });

  it('resolves null when the identity has no association (fail closed)', async () => {
    const adapter = new Module02InventoryAuthorizationAdapter(resolverMock(null));

    await expect(adapter.resolveActiveAssociation(IDENTITY, SELLER)).resolves.toBeNull();
  });

  it('fails closed to null when the resolver raises (no silent grant)', async () => {
    const adapter = new Module02InventoryAuthorizationAdapter(failingResolverMock());

    await expect(adapter.resolveActiveAssociation(IDENTITY, SELLER)).resolves.toBeNull();
  });

  it('never trusts a client-supplied ownership claim — scope comes only from the resolver', async () => {
    const adapter = new Module02InventoryAuthorizationAdapter(resolverMock(null));

    const facts = await adapter.resolveActiveAssociation(IDENTITY, SELLER);
    expect(facts).toBeNull();
  });
});
