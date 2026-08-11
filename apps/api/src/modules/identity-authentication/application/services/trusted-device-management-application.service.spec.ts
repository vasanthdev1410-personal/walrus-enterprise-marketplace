import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { Identity } from '../../domain/identity/entities/identity';
import { TrustedDevice } from '../../domain/identity/entities/trusted-device';
import type { TrustedDeviceProperties } from '../../domain/identity/entities/trusted-device';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import { TrustedDeviceManagementApplicationService } from './trusted-device-management-application.service';

const IDENTITY_ID = '0191310f-789a-7123-8123-000000000001';
const DEVICE_A = '0191310f-789a-7123-8123-000000000002';
const DEVICE_B = '0191310f-789a-7123-8123-000000000003';
const FOREIGN_DEVICE = '0191310f-789a-7123-8123-000000000004';
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

function buildDevice(overrides: Partial<TrustedDeviceProperties> = {}): TrustedDevice {
  return new TrustedDevice({
    trustedDeviceId: new UuidV7(DEVICE_A),
    identityId: new UuidV7(IDENTITY_ID),
    protectedDeviceFingerprint: new ProtectedValue('envelope:device-fingerprint-a'),
    deviceState: 'TRUSTED',
    trustExpiresAt: new Date(FIXED_NOW.getTime() + 30 * 24 * 3_600_000),
    aggregateVersion: new AggregateVersion(1),
    createdAt: new Date(FIXED_NOW.getTime() - 3_600_000),
    updatedAt: FIXED_NOW,
    ...overrides,
  });
}

function buildSnapshot(trustedDevices: readonly TrustedDevice[]): IdentityAuthenticationSnapshot {
  return {
    identity: new Identity({
      identityId: new UuidV7(IDENTITY_ID),
      identityState: 'ACTIVE',
      verificationState: 'VERIFIED',
      aggregateVersion: new AggregateVersion(1),
      createdAt: new Date(FIXED_NOW.getTime() - 24 * 3_600_000),
      updatedAt: FIXED_NOW,
    }),
    identifiers: [],
    credentials: [],
    classificationAssignments: [],
    mfaEnrollments: [],
    mfaFactors: [],
    trustedDevices,
  };
}

function createFixture(): {
  service: TrustedDeviceManagementApplicationService;
  identities: jest.Mocked<IdentityRepository>;
} {
  const identities: jest.Mocked<IdentityRepository> = {
    findById: jest.fn(),
    findAuthenticationById: jest.fn(),
    findByIdentifierLookups: jest.fn(),
    findPasswordHistory: jest.fn(),
    findRecoveryCodeSets: jest.fn().mockResolvedValue(null),
    insert: jest.fn(),
    save: jest.fn(),
    advanceTotpReplayState: jest.fn(),
  };
  const service = new TrustedDeviceManagementApplicationService(identities, {
    now: () => FIXED_NOW,
  });
  return { service, identities };
}

describe('TrustedDeviceManagementApplicationService.listDevices (M01-DEV-001)', () => {
  it("returns the identity's trusted devices newest first", async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot([
        buildDevice({
          trustedDeviceId: new UuidV7(DEVICE_A),
          createdAt: new Date(FIXED_NOW.getTime() - 3_600_000),
        }),
        buildDevice({
          trustedDeviceId: new UuidV7(DEVICE_B),
          createdAt: new Date(FIXED_NOW.getTime() - 60_000),
        }),
      ]),
    );

    const result = await service.listDevices({ identityId: new UuidV7(IDENTITY_ID) });

    expect(result.map((device) => device.properties.trustedDeviceId.value)).toEqual([
      DEVICE_B,
      DEVICE_A,
    ]);
  });

  it('returns an empty list when the identity has no device records', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot([]));

    const result = await service.listDevices({ identityId: new UuidV7(IDENTITY_ID) });

    expect(result).toEqual([]);
  });
});

describe('TrustedDeviceManagementApplicationService.revokeDevice (M01-DEV-002)', () => {
  it('revokes an owned TRUSTED device through the version-guarded aggregate write', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot([buildDevice({ trustedDeviceId: new UuidV7(DEVICE_A) })]),
    );

    await service.revokeDevice({
      identityId: new UuidV7(IDENTITY_ID),
      trustedDeviceId: new UuidV7(DEVICE_A),
      expectedDeviceVersion: 1,
    });

    const changeSet = identities.save.mock.calls[0]?.[0];
    const revoked = changeSet?.trustedDevices[0]?.properties;
    expect(revoked?.deviceState).toBe('REVOKED');
    expect(revoked?.revokedAt).toBe(FIXED_NOW);
    expect(revoked?.revocationReason).toBe('USER_REVOKED');
    expect(revoked?.aggregateVersion.value).toBe(2);
    expect(identities.save.mock.calls[0]?.[1]?.value).toBe(1);
  });

  it('fails closed with RESOURCE_NOT_AVAILABLE for an unknown device', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(buildSnapshot([]));

    await expect(
      service.revokeDevice({
        identityId: new UuidV7(IDENTITY_ID),
        trustedDeviceId: new UuidV7(DEVICE_A),
        expectedDeviceVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('fails closed with RESOURCE_NOT_AVAILABLE for a device owned by another identity', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot([
        buildDevice({
          trustedDeviceId: new UuidV7(FOREIGN_DEVICE),
          identityId: new UuidV7('0191310f-789a-7123-8123-0000000000ff'),
        }),
      ]),
    );

    await expect(
      service.revokeDevice({
        identityId: new UuidV7(IDENTITY_ID),
        trustedDeviceId: new UuidV7(FOREIGN_DEVICE),
        expectedDeviceVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
  });

  it('rejects a stale device version precondition', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot([buildDevice({ trustedDeviceId: new UuidV7(DEVICE_A) })]),
    );

    await expect(
      service.revokeDevice({
        identityId: new UuidV7(IDENTITY_ID),
        trustedDeviceId: new UuidV7(DEVICE_A),
        expectedDeviceVersion: 2,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('is idempotent for an already-REVOKED device (never restores trust)', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot([
        buildDevice({
          trustedDeviceId: new UuidV7(DEVICE_A),
          deviceState: 'REVOKED',
          revokedAt: FIXED_NOW,
        }),
      ]),
    );

    await service.revokeDevice({
      identityId: new UuidV7(IDENTITY_ID),
      trustedDeviceId: new UuidV7(DEVICE_A),
      expectedDeviceVersion: 1,
    });

    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('is idempotent for a BLOCKED device', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot([
        buildDevice({ trustedDeviceId: new UuidV7(DEVICE_A), deviceState: 'BLOCKED' }),
      ]),
    );

    await service.revokeDevice({
      identityId: new UuidV7(IDENTITY_ID),
      trustedDeviceId: new UuidV7(DEVICE_A),
      expectedDeviceVersion: 1,
    });

    expect(identities.save.mock.calls).toHaveLength(0);
  });

  it('maps a concurrent aggregate conflict to RESOURCE_STATE_CONFLICT', async () => {
    const { service, identities } = createFixture();
    identities.findAuthenticationById.mockResolvedValue(
      buildSnapshot([buildDevice({ trustedDeviceId: new UuidV7(DEVICE_A) })]),
    );
    identities.save.mockRejectedValue(new OptimisticConcurrencyError('Identity aggregate'));

    await expect(
      service.revokeDevice({
        identityId: new UuidV7(IDENTITY_ID),
        trustedDeviceId: new UuidV7(DEVICE_A),
        expectedDeviceVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
  });
});
