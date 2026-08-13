import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { SellerIdentityAssociation } from '../entities/seller-identity-association';
import { SellerAssociationPolicy } from './seller-association.policy';

const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000001');
const OWNER_ID = new UuidV7('0191310f-789a-7123-8123-000000000002');
const MEMBER_A = new UuidV7('0191310f-789a-7123-8123-000000000003');
const MEMBER_B = new UuidV7('0191310f-789a-7123-8123-000000000004');
const NOW = new Date('2026-08-12T00:00:00.000Z');

function association(
  associationIdSeed: number,
  identityId: UuidV7,
  role: 'OWNER' | 'MEMBER',
  state: 'ACTIVE' | 'REMOVED' = 'ACTIVE',
): SellerIdentityAssociation {
  const suffix = String(associationIdSeed).padStart(2, '0');
  return new SellerIdentityAssociation({
    associationId: new UuidV7(`0191310f-789a-7123-8123-0000000000${suffix}`),
    sellerProfileId: SELLER,
    identityId,
    associationRole: role,
    isPrimary: role === 'OWNER',
    state,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
    ...(state === 'REMOVED' ? { removedAt: NOW } : {}),
  });
}

describe('SellerAssociationPolicy (M03-M1, WEMP-M03-CONTRACT-001 §A.2)', () => {
  const policy = new SellerAssociationPolicy();

  it('accepts exactly one OWNER (primary) and any number of members', () => {
    const owner = policy.assertValidAssociations([
      association(1, OWNER_ID, 'OWNER'),
      association(2, MEMBER_A, 'MEMBER'),
      association(3, MEMBER_B, 'MEMBER'),
    ]);
    expect(owner.properties.identityId.value).toBe(OWNER_ID.value);
  });

  it('rejects a seller with no owner (fail closed)', () => {
    expect(() =>
      policy.assertValidAssociations([association(1, MEMBER_A, 'MEMBER')]),
    ).toThrow('SELLER_OWNER_CONFLICT');
  });

  it('rejects a seller with multiple owners', () => {
    expect(() =>
      policy.assertValidAssociations([
        association(1, OWNER_ID, 'OWNER'),
        association(2, MEMBER_A, 'OWNER'),
      ]),
    ).toThrow('SELLER_OWNER_CONFLICT');
  });

  it('rejects a duplicate identity association for the same seller', () => {
    expect(() =>
      policy.assertValidAssociations([
        association(1, OWNER_ID, 'OWNER'),
        association(2, OWNER_ID, 'MEMBER'),
      ]),
    ).toThrow('SELLER_ASSOCIATION_CONFLICT');
  });

  it('ignores REMOVED associations when counting owners', () => {
    const owner = policy.assertValidAssociations([
      association(1, OWNER_ID, 'OWNER'),
      association(2, MEMBER_A, 'MEMBER', 'REMOVED'),
    ]);
    expect(owner.properties.identityId.value).toBe(OWNER_ID.value);
  });

  describe('findActiveAssociation', () => {
    const associations = [
      association(1, OWNER_ID, 'OWNER'),
      association(2, MEMBER_A, 'MEMBER'),
      association(3, MEMBER_B, 'MEMBER', 'REMOVED'),
    ];

    it('resolves the active association of a member', () => {
      const found = policy.findActiveAssociation(associations, MEMBER_A.value);
      expect(found?.properties.associationRole).toBe('MEMBER');
    });

    it('resolves the owner association', () => {
      const found = policy.findActiveAssociation(associations, OWNER_ID.value);
      expect(found?.properties.associationRole).toBe('OWNER');
    });

    it('returns null for an identity with no active association (fail closed)', () => {
      expect(policy.findActiveAssociation(associations, MEMBER_B.value)).toBeNull();
      expect(
        policy.findActiveAssociation(
          associations,
          new UuidV7('0191310f-789a-7123-8123-000000000099').value,
        ),
      ).toBeNull();
    });
  });
});
