/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { UuidV7 } from '../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { PrismaCustomerOwnershipResolver } from './prisma-customer-ownership-resolver';

const IDENTITY_ID = new UuidV7('01913110-789a-7123-8123-000000000001');
const OTHER_IDENTITY_ID = new UuidV7('01913110-789a-7123-8123-000000000002');
const CUSTOMER_PROFILE_ID = new UuidV7('01913110-789a-7123-8123-000000000003');

function profileRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    customerProfileId: CUSTOMER_PROFILE_ID.value,
    identityId: IDENTITY_ID.value,
    state: 'ACTIVE',
    aggregateVersion: 1,
    createdAt: new Date('2026-08-17T00:00:00.000Z'),
    updatedAt: new Date('2026-08-17T00:00:00.000Z'),
    ...overrides,
  };
}

describe('PrismaCustomerOwnershipResolver (D-07, WEMP-M06-AUTHZ-001 §4)', () => {
  it('resolves identity → CustomerProfile.identityId → scope', async () => {
    const prisma = {
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue(profileRow()),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaCustomerOwnershipResolver(prisma).resolveCustomerScope(
      IDENTITY_ID,
      CUSTOMER_PROFILE_ID,
    );

    expect(scope).toEqual({
      customerProfileId: CUSTOMER_PROFILE_ID,
      identityId: IDENTITY_ID,
      customerState: 'ACTIVE',
    });
    expect(prisma.customerProfile.findUnique).toHaveBeenCalledWith({
      where: { customerProfileId: CUSTOMER_PROFILE_ID.value },
    });
  });

  it('resolves to null when the identity does not own the profile (cross-customer access)', async () => {
    const prisma = {
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue(profileRow()),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaCustomerOwnershipResolver(prisma).resolveCustomerScope(
      OTHER_IDENTITY_ID,
      CUSTOMER_PROFILE_ID,
    );

    expect(scope).toBeNull();
  });

  it('resolves to null when the profile does not exist', async () => {
    const prisma = {
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaCustomerOwnershipResolver(prisma).resolveCustomerScope(
      IDENTITY_ID,
      CUSTOMER_PROFILE_ID,
    );

    expect(scope).toBeNull();
  });

  it('preserves the SUSPENDED state for scope evaluation', async () => {
    const prisma = {
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue(profileRow({ state: 'SUSPENDED' })),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaCustomerOwnershipResolver(prisma).resolveCustomerScope(
      IDENTITY_ID,
      CUSTOMER_PROFILE_ID,
    );

    expect(scope?.customerState).toBe('SUSPENDED');
  });

  it('preserves the CLOSED state so the engine can deny terminal profiles', async () => {
    const prisma = {
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue(profileRow({ state: 'CLOSED' })),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaCustomerOwnershipResolver(prisma).resolveCustomerScope(
      IDENTITY_ID,
      CUSTOMER_PROFILE_ID,
    );

    expect(scope?.customerState).toBe('CLOSED');
  });

  it('fails closed (null) when the storage lookup throws', async () => {
    const prisma = {
      customerProfile: {
        findUnique: jest.fn().mockRejectedValue(new Error('storage down')),
      },
    } as unknown as PrismaService;

    const scope = await new PrismaCustomerOwnershipResolver(prisma).resolveCustomerScope(
      IDENTITY_ID,
      CUSTOMER_PROFILE_ID,
    );

    expect(scope).toBeNull();
  });
});
