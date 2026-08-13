import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { OptimisticConcurrencyError } from '../../../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { ProtectedValue } from '../../../../../identity-authentication/domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { SellerIdentityAssociation } from '../../../../domain/entities/seller-identity-association';
import { SellerOrganization } from '../../../../domain/entities/seller-organization';
import { SellerProfile } from '../../../../domain/entities/seller-profile';
import { SellerStateTransition } from '../../../../domain/entities/seller-state-transition';
import type { SellerAggregateChangeSet } from '../../../../domain/ports/seller-repository.port';
import { PrismaSellerProfileRepository } from './prisma-seller-profile.repository';

const SELLER_PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000001');
const ORGANIZATION_ID = new UuidV7('01913110-789a-7123-8123-000000000002');
const IDENTITY_ID = new UuidV7('01913110-789a-7123-8123-000000000003');
const ASSOCIATION_ID = new UuidV7('01913110-789a-7123-8123-000000000004');
const VERIFICATION_ID = new UuidV7('01913110-789a-7123-8123-000000000005');
const EVIDENCE_ID = new UuidV7('01913110-789a-7123-8123-000000000006');
const TRANSITION_ID = new UuidV7('01913110-789a-7123-8123-000000000009');
const ACTOR = new UuidV7('01913110-789a-7123-8123-000000000010');
const NOW = new Date('2026-08-12T00:00:00.000Z');
const CORRELATION = new CorrelationIdentifier('01913110-789a-7123-8123-000000000011');

const profileRow = {
  sellerProfileId: SELLER_PROFILE_ID.value,
  organizationId: ORGANIZATION_ID.value,
  state: 'DRAFT',
  complianceState: 'NOT_STARTED',
  aggregateVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  submittedAt: null,
  approvedAt: null,
  suspendedAt: null,
  closedAt: null,
  correlationId: null,
};

function draftProfile(): SellerProfile {
  return new SellerProfile({
    sellerProfileId: SELLER_PROFILE_ID,
    organizationId: ORGANIZATION_ID,
    state: 'DRAFT',
    complianceState: 'NOT_STARTED',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function ownerAssociation(): SellerIdentityAssociation {
  return new SellerIdentityAssociation({
    associationId: ASSOCIATION_ID,
    sellerProfileId: SELLER_PROFILE_ID,
    identityId: IDENTITY_ID,
    associationRole: 'OWNER',
    isPrimary: true,
    state: 'ACTIVE',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function initialTransition(): SellerStateTransition {
  return new SellerStateTransition({
    sellerStateTransitionId: TRANSITION_ID,
    sellerProfileId: SELLER_PROFILE_ID,
    toState: 'DRAFT',
    stateVersion: 1,
    actorIdentityId: ACTOR,
    actorKind: 'SELLER_OWNER',
    transitionedAt: NOW,
    createdAt: NOW,
    correlationId: CORRELATION,
  });
}

function organization(): SellerOrganization {
  return new SellerOrganization({
    organizationId: ORGANIZATION_ID,
    legalName: 'Walrus Retail Pvt Ltd',
    tradeName: 'Walrus Retail',
    registrationNumber: new ProtectedValue('GSTIN1234567890123'),
    registrationLookupDigest: 'a'.repeat(64),
    businessAddress: '1 Market Street, Bengaluru',
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function changeSet(profile: SellerProfile = draftProfile()): SellerAggregateChangeSet {
  return {
    sellerProfile: profile,
    organization: organization(),
    associationsToAppend: [ownerAssociation()],
    verificationsToAppend: [],
    evidenceToAppend: [],
    transitionsToAppend: [initialTransition()],
    warehousesToAppend: [],
    agreementsToAppend: [],
    auditRecordsToAppend: [],
  };
}

describe('PrismaSellerProfileRepository (M03 persistence)', () => {
  it('maps a persisted seller profile row back to the domain', async () => {
    const findUnique = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(profileRow);
    const prisma = { sellerProfile: { findUnique } } as unknown as PrismaService;

    const profile = await new PrismaSellerProfileRepository(prisma).findById(SELLER_PROFILE_ID);

    expect(findUnique).toHaveBeenCalledWith({
      where: { sellerProfileId: SELLER_PROFILE_ID.value },
    });
    expect(profile?.properties).toMatchObject({
      sellerProfileId: SELLER_PROFILE_ID,
      state: 'DRAFT',
      complianceState: 'NOT_STARTED',
    });
  });

  it('returns null when no seller profile exists', async () => {
    const prisma = {
      sellerProfile: { findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const result = await new PrismaSellerProfileRepository(prisma).findById(SELLER_PROFILE_ID);

    expect(result).toBeNull();
  });

  it('maps the organization row back to the domain with protected registration', async () => {
    const findUnique = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
      organizationId: ORGANIZATION_ID.value,
      legalName: 'Walrus Retail Pvt Ltd',
      tradeName: 'Walrus Retail',
      businessType: null,
      registrationNumber: 'GSTIN1234567890123',
      registrationLookupDigest: 'a'.repeat(64),
      businessAddress: '1 Market Street, Bengaluru',
      aggregateVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const prisma = { sellerOrganization: { findUnique } } as unknown as PrismaService;

    const result = await new PrismaSellerProfileRepository(prisma).findOrganization(
      ORGANIZATION_ID,
    );

    expect(result?.properties.registrationNumber.toString()).toBe('[PROTECTED]');
    expect(result?.properties.registrationNumber.value).toBe('GSTIN1234567890123');
  });

  it('maps association rows back to the domain', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        associationId: ASSOCIATION_ID.value,
        sellerProfileId: SELLER_PROFILE_ID.value,
        identityId: IDENTITY_ID.value,
        associationRole: 'OWNER',
        isPrimary: true,
        state: 'ACTIVE',
        aggregateVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        removedAt: null,
      },
    ]);
    const prisma = { sellerIdentityAssociation: { findMany } } as unknown as PrismaService;

    const associations = await new PrismaSellerProfileRepository(prisma).findAssociations(
      SELLER_PROFILE_ID,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { sellerProfileId: SELLER_PROFILE_ID.value },
      orderBy: { createdAt: 'asc' },
    });
    expect(associations[0]?.properties).toMatchObject({
      associationRole: 'OWNER',
      isPrimary: true,
      state: 'ACTIVE',
    });
  });

  it('maps verification and evidence rows back to the domain', async () => {
    const prisma = {
      sellerBusinessVerification: {
        findMany: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
          {
            verificationId: VERIFICATION_ID.value,
            sellerProfileId: SELLER_PROFILE_ID.value,
            verificationType: 'GST',
            state: 'SUBMITTED',
            generation: 1,
            submittedByIdentityId: IDENTITY_ID.value,
            reviewedByIdentityId: null,
            reviewedAt: null,
            aggregateVersion: 1,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ]),
      },
      sellerVerificationEvidence: {
        findMany: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
          {
            evidenceId: EVIDENCE_ID.value,
            verificationId: VERIFICATION_ID.value,
            evidenceType: 'GST_CERTIFICATE',
            evidenceReference: 's3://walrus-evidence/m03/gst-1.pdf',
            evidenceDigest: 'b'.repeat(64),
            uploadedByIdentityId: IDENTITY_ID.value,
            uploadedAt: NOW,
            createdAt: NOW,
          },
        ]),
      },
    } as unknown as PrismaService;
    const repository = new PrismaSellerProfileRepository(prisma);

    const verifications = await repository.findVerifications(SELLER_PROFILE_ID);
    const evidence = await repository.findEvidence(VERIFICATION_ID);

    expect(verifications[0]?.properties).toMatchObject({
      verificationType: 'GST',
      state: 'SUBMITTED',
      generation: 1,
    });
    expect(evidence[0]?.properties).toMatchObject({
      evidenceReference: 's3://walrus-evidence/m03/gst-1.pdf',
      evidenceDigest: 'b'.repeat(64),
    });
  });

  it('maps transitions ordered by state version', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        sellerStateTransitionId: TRANSITION_ID.value,
        sellerProfileId: SELLER_PROFILE_ID.value,
        fromState: null,
        toState: 'DRAFT',
        stateVersion: 1,
        actorIdentityId: ACTOR.value,
        actorKind: 'SELLER_OWNER',
        reasonReference: null,
        correlationId: CORRELATION.value,
        causationId: null,
        sourceReference: null,
        transitionedAt: NOW,
        createdAt: NOW,
      },
    ]);
    const prisma = { sellerStateTransition: { findMany } } as unknown as PrismaService;

    const transitions = await new PrismaSellerProfileRepository(prisma).findTransitions(
      SELLER_PROFILE_ID,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { sellerProfileId: SELLER_PROFILE_ID.value },
      orderBy: { stateVersion: 'asc' },
    });
    expect(transitions[0]?.properties).toMatchObject({
      toState: 'DRAFT',
      stateVersion: 1,
      actorKind: 'SELLER_OWNER',
    });
  });

  it('resolves an ACTIVE seller by registration digest through its organization', async () => {
    const findFirst = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
      ...profileRow,
      state: 'ACTIVE',
    });
    const prisma = {
      sellerOrganization: {
        findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
          organizationId: ORGANIZATION_ID.value,
          registrationLookupDigest: 'a'.repeat(64),
        }),
      },
      sellerProfile: {
        findFirst,
      },
    } as unknown as PrismaService;

    const profile = await new PrismaSellerProfileRepository(prisma).findActiveByRegistrationDigest(
      'a'.repeat(64),
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID.value, state: 'ACTIVE' },
    });
    expect(profile?.properties.state).toBe('ACTIVE');
  });

  it('returns null for a registration digest with no organization', async () => {
    const prisma = {
      sellerOrganization: {
        findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const profile = await new PrismaSellerProfileRepository(prisma).findActiveByRegistrationDigest(
      'c'.repeat(64),
    );

    expect(profile).toBeNull();
  });

  it('resolves a seller profile through an ACTIVE identity association', async () => {
    const findFirst = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
      associationId: ASSOCIATION_ID.value,
      sellerProfileId: SELLER_PROFILE_ID.value,
      identityId: IDENTITY_ID.value,
      state: 'ACTIVE',
    });
    const prisma = {
      sellerIdentityAssociation: {
        findFirst,
      },
      sellerProfile: {
        findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(profileRow),
      },
    } as unknown as PrismaService;

    const profile = await new PrismaSellerProfileRepository(
      prisma,
    ).findProfileByAssociatedIdentityId(IDENTITY_ID);

    expect(findFirst).toHaveBeenCalledWith({
      where: { identityId: IDENTITY_ID.value, state: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    expect(profile?.properties.sellerProfileId).toMatchObject(SELLER_PROFILE_ID);
  });

  it('returns null when the identity has no active association', async () => {
    const prisma = {
      sellerIdentityAssociation: {
        findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const profile = await new PrismaSellerProfileRepository(
      prisma,
    ).findProfileByAssociatedIdentityId(IDENTITY_ID);

    expect(profile).toBeNull();
  });

  it('inserts the profile, organization and appended records in one transaction', async () => {
    const createProfile = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const createOrganization = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const createAssociation = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const createTransition = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
    const transaction = {
      sellerProfile: { create: createProfile },
      sellerOrganization: { create: createOrganization },
      sellerIdentityAssociation: { create: createAssociation },
      sellerStateTransition: { create: createTransition },
    };
    const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
      operation(transaction as never),
    );
    const repository = new PrismaSellerProfileRepository({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    await repository.insert(changeSet());

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(createProfile).toHaveBeenCalledTimes(1);
    expect(createOrganization).toHaveBeenCalledTimes(1);
    expect(createAssociation).toHaveBeenCalledTimes(1);
    expect(createTransition).toHaveBeenCalledTimes(1);
    const profileCreate = createProfile.mock.calls[0]?.[0] as
      { data?: Record<string, unknown> } | undefined;
    expect(profileCreate?.data).toMatchObject({
      sellerProfileId: SELLER_PROFILE_ID.value,
      state: 'DRAFT',
      aggregateVersion: 1,
    });
  });

  it('rolls back the whole change set when a child insert fails', async () => {
    const failure = new Error('association write failed');
    const transaction = {
      sellerProfile: { create: jest.fn().mockResolvedValue(undefined) },
      sellerOrganization: { create: jest.fn().mockResolvedValue(undefined) },
      sellerIdentityAssociation: { create: jest.fn().mockRejectedValue(failure) },
      sellerStateTransition: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const runTransaction = jest.fn(async (operation: (client: never) => Promise<void>) =>
      operation(transaction as never),
    );
    const repository = new PrismaSellerProfileRepository({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    await expect(repository.insert(changeSet())).rejects.toBe(failure);
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('saves a versioned change set when the expected version is current', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const transaction = {
      sellerProfile: { updateMany },
      sellerOrganization: { upsert: jest.fn().mockResolvedValue(undefined) },
      sellerIdentityAssociation: { upsert: jest.fn().mockResolvedValue(undefined) },
      sellerStateTransition: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const repository = new PrismaSellerProfileRepository({
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService);

    const submitted = new SellerProfile({
      ...draftProfile().properties,
      state: 'SUBMITTED',
      submittedAt: NOW,
      aggregateVersion: new AggregateVersion(2),
      updatedAt: NOW,
    });
    await repository.save(changeSet(submitted), new AggregateVersion(1));

    const update = updateMany.mock.calls[0]?.[0] as
      { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
    expect(update?.where).toMatchObject({
      sellerProfileId: SELLER_PROFILE_ID.value,
      aggregateVersion: 1,
    });
    expect(update?.data).toMatchObject({ state: 'SUBMITTED', aggregateVersion: 2 });
  });

  it('rejects a stale save with OptimisticConcurrencyError and appends nothing', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 0 });
    const createTransition = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      sellerProfile: { updateMany },
      sellerOrganization: { upsert: jest.fn().mockResolvedValue(undefined) },
      sellerIdentityAssociation: { upsert: jest.fn().mockResolvedValue(undefined) },
      sellerStateTransition: { create: createTransition },
    };
    const repository = new PrismaSellerProfileRepository({
      $transaction: jest.fn(async (operation: (client: never) => Promise<void>) =>
        operation(transaction as never),
      ),
    } as unknown as PrismaService);

    await expect(repository.save(changeSet(), new AggregateVersion(1))).rejects.toBeInstanceOf(
      OptimisticConcurrencyError,
    );
    expect(createTransition).not.toHaveBeenCalled();
  });
});
