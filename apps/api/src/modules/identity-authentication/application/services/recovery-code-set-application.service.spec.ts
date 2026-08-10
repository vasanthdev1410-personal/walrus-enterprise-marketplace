import { Identity } from '../../domain/identity/entities/identity';
import { RecoveryCodeRecord } from '../../domain/identity/entities/recovery-code-record';
import { RecoveryCodeSet } from '../../domain/identity/entities/recovery-code-set';
import type {
  IdentityRepository,
  RecoveryCodeSetsSnapshot,
} from '../../domain/identity/repositories/identity-repository';
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { MfaError } from '../errors/mfa.error';
import type { UuidV7GenerationPort } from '../ports/application-runtime.port';
import type {
  IssuedProtectedValue,
  OtpRecoveryCodeCryptographicPort,
  RecoveryCodeDigestContext,
} from '../ports/otp-recovery-code-cryptographic.port';
import { RecoveryCodeSetApplicationService } from './recovery-code-set-application.service';

const identityId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ab');
const existingSetId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890b1');
const now = new Date('2026-08-05T00:00:00.000Z');

const ISSUED_CODES: readonly IssuedProtectedValue[] = [
  { rawValue: 'AAAA0000BBBB1111CCCC2222DDDD', digest: 'digest-1', keyVersion: 'test-v1' },
  { rawValue: 'EEEE3333FFFF4444GGGG5555HHHH', digest: 'digest-2', keyVersion: 'test-v1' },
];

function buildIdentity(version = 4): Identity {
  return new Identity({
    identityId,
    identityState: 'ACTIVE',
    verificationState: 'VERIFIED',
    aggregateVersion: new AggregateVersion(version),
    createdAt: now,
    updatedAt: now,
  });
}

function buildExistingSet(setVersion = 2): RecoveryCodeSet {
  return new RecoveryCodeSet({
    recoveryCodeSetId: existingSetId,
    identityId,
    setVersion,
    setState: 'ACTIVE',
    createdAt: now,
  });
}

function buildExistingCodes(count = 2): readonly RecoveryCodeRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = (index + 1).toString().padStart(12, '0');
    return new RecoveryCodeRecord({
      recoveryCodeId: new UuidV7(`01890f3e-7b5a-7cc0-8c9d-${suffix}`),
      recoveryCodeSetId: existingSetId,
      codeDigest: new ProtectedValue(`existing-digest-${String(index + 1)}`),
      codeState: 'ACTIVE',
      createdAt: now,
    });
  });
}

function createFixture(options: {
  snapshot: Identity | null;
  existing?: RecoveryCodeSetsSnapshot | null;
  issueRecoveryCodeSet?: jest.MockedFunction<
    OtpRecoveryCodeCryptographicPort['issueRecoveryCodeSet']
  >;
  saveError?: unknown;
}): {
  service: RecoveryCodeSetApplicationService;
  identities: jest.Mocked<IdentityRepository>;
  issueRecoveryCodeSet: jest.MockedFunction<
    OtpRecoveryCodeCryptographicPort['issueRecoveryCodeSet']
  >;
  save: jest.MockedFunction<IdentityRepository['save']>;
  nextIds: string[];
} {
  const issueRecoveryCodeSet: jest.MockedFunction<
    OtpRecoveryCodeCryptographicPort['issueRecoveryCodeSet']
  > =
    options.issueRecoveryCodeSet ?? jest.fn().mockReturnValue(ISSUED_CODES);

  let sequence = 0;
  const nextIds: string[] = [];
  const identifiers = {
    next: () => {
      const base = '01890f3e-7b5a-7cc0-8c9d-';
      const suffix = (++sequence).toString().padStart(12, '0');
      const id = new UuidV7(`${base}${suffix}`);
      nextIds.push(id.value);
      return id;
    },
  } as jest.Mocked<UuidV7GenerationPort>;

  const findAuthenticationById = jest.fn().mockResolvedValue(
    options.snapshot === null
      ? null
      : { identity: options.snapshot, identifiers: [], credentials: [], classificationAssignments: [], mfaEnrollments: [], mfaFactors: [] },
  );
  const findRecoveryCodeSets = jest
    .fn()
    .mockResolvedValue(options.existing ?? { recoveryCodeSets: [], recoveryCodes: [] });
  const save: jest.MockedFunction<IdentityRepository['save']> = jest
    .fn()
    .mockResolvedValue(undefined);
  if (options.saveError !== undefined) save.mockRejectedValue(options.saveError);

  const identities = {
    findById: jest.fn(),
    findAuthenticationById,
    findByIdentifierLookups: jest.fn(),
    findPasswordHistory: jest.fn(),
    findRecoveryCodeSets,
    insert: jest.fn(),
    save,
    advanceTotpReplayState: jest.fn(),
  } as unknown as jest.Mocked<IdentityRepository>;

  const service = new RecoveryCodeSetApplicationService(
    identities,
    { issueOtp: jest.fn(), matchesOtp: jest.fn(), issueRecoveryCodeSet, matchesRecoveryCode: jest.fn() },
    { now: () => now },
    identifiers,
    { environment: 'test' },
  );

  return { service, identities, issueRecoveryCodeSet, save, nextIds };
}

describe('RecoveryCodeSetApplicationService (M01-MFA-005)', () => {
  it('issues a fresh ACTIVE set at setVersion 1 when none exists and returns raw codes once', async () => {
    const fixture = createFixture({ snapshot: buildIdentity() });

    const result = await fixture.service.regenerate({
      identityId,
      expectedIdentityVersion: 4,
    });

    expect(result.recoveryCodeSetId).toMatch(/^01890f3e-/);
    expect(result.setVersion).toBe(1);
    expect(result.recoveryCodes).toEqual(ISSUED_CODES.map((code) => code.rawValue));
    expect(fixture.issueRecoveryCodeSet).toHaveBeenCalledWith({
      environment: 'test',
      identityId: identityId.value,
      recoveryCodeSetId: result.recoveryCodeSetId,
    } satisfies RecoveryCodeDigestContext);

    const changeSet = fixture.save.mock.calls[0]?.[0];
    expect(changeSet?.recoveryCodeSets).toHaveLength(1);
    expect(changeSet?.recoveryCodeSets[0]?.properties.setState).toBe('ACTIVE');
    expect(changeSet?.recoveryCodeSets[0]?.properties.setVersion).toBe(1);
    expect(changeSet?.recoveryCodes).toHaveLength(2);
    // Only digests are persisted — raw codes never enter the change set.
    for (const code of changeSet?.recoveryCodes ?? []) {
      expect(code.properties.codeState).toBe('ACTIVE');
      expect(code.properties.codeDigest.value).toMatch(/^digest-/);
    }
  });

  it('supersedes the prior ACTIVE set and invalidates every prior unused code', async () => {
    const fixture = createFixture({
      snapshot: buildIdentity(),
      existing: {
        recoveryCodeSets: [buildExistingSet(2)],
        recoveryCodes: buildExistingCodes(2),
      },
    });

    const result = await fixture.service.regenerate({
      identityId,
      expectedIdentityVersion: 4,
    });

    expect(result.setVersion).toBe(3);
    const changeSet = fixture.save.mock.calls[0]?.[0];
    expect(changeSet?.recoveryCodeSets).toHaveLength(2);
    const superseded = changeSet?.recoveryCodeSets.find(
      (set) => set.properties.recoveryCodeSetId.value === existingSetId.value,
    );
    expect(superseded?.properties.setState).toBe('SUPERSEDED');
    expect(superseded?.properties.invalidatedAt).toEqual(now);
    expect(superseded?.properties.invalidationReason).toBe('REGENERATED');
    const newSet = changeSet?.recoveryCodeSets.find(
      (set) => set.properties.recoveryCodeSetId.value !== existingSetId.value,
    );
    expect(newSet?.properties.setState).toBe('ACTIVE');
    expect(newSet?.properties.setVersion).toBe(3);

    const priorCodes = changeSet?.recoveryCodes.filter(
      (code) => code.properties.recoveryCodeSetId.value === existingSetId.value,
    );
    expect(priorCodes).toHaveLength(2);
    for (const code of priorCodes ?? []) {
      expect(code.properties.codeState).toBe('INVALIDATED');
      expect(code.properties.invalidatedAt).toEqual(now);
    }
    const newCodes = changeSet?.recoveryCodes.filter(
      (code) => code.properties.recoveryCodeSetId.value !== existingSetId.value,
    );
    expect(newCodes).toHaveLength(2);
    for (const code of newCodes ?? []) expect(code.properties.codeState).toBe('ACTIVE');
  });

  it('keeps already-consumed or invalidated prior codes in their terminal state', async () => {
    const consumed = new RecoveryCodeRecord({
      recoveryCodeId: new UuidV7('01890f3e-7b5a-7cc0-8c9d-000000000003'),
      recoveryCodeSetId: existingSetId,
      codeDigest: new ProtectedValue('consumed-digest'),
      codeState: 'CONSUMED',
      createdAt: now,
      consumedAt: now,
    });
    const invalidated = new RecoveryCodeRecord({
      recoveryCodeId: new UuidV7('01890f3e-7b5a-7cc0-8c9d-000000000004'),
      recoveryCodeSetId: existingSetId,
      codeDigest: new ProtectedValue('invalidated-digest'),
      codeState: 'INVALIDATED',
      createdAt: now,
      invalidatedAt: now,
    });
    const fixture = createFixture({
      snapshot: buildIdentity(),
      existing: {
        recoveryCodeSets: [buildExistingSet(1)],
        recoveryCodes: [consumed, invalidated],
      },
    });

    await fixture.service.regenerate({ identityId, expectedIdentityVersion: 4 });

    const changeSet = fixture.save.mock.calls[0]?.[0];
    const priorCodes = changeSet?.recoveryCodes.filter(
      (code) => code.properties.recoveryCodeSetId.value === existingSetId.value,
    );
    expect(priorCodes?.find((code) => code.properties.codeState === 'CONSUMED')).toBeDefined();
    expect(priorCodes?.find((code) => code.properties.codeState === 'INVALIDATED')).toBeDefined();
  });

  it('rejects regeneration when the identity is missing', async () => {
    const fixture = createFixture({ snapshot: null });
    await expect(
      fixture.service.regenerate({ identityId, expectedIdentityVersion: 4 }),
    ).rejects.toBeInstanceOf(MfaError);
  });

  it('rejects regeneration for a non-AUTHENTICATABLE identity (defense-in-depth)', async () => {
    const suspended = new Identity({
      identityId,
      identityState: 'SUSPENDED',
      verificationState: 'VERIFIED',
      aggregateVersion: new AggregateVersion(4),
      createdAt: now,
      updatedAt: now,
    });
    const fixture = createFixture({ snapshot: suspended });
    await expect(
      fixture.service.regenerate({ identityId, expectedIdentityVersion: 4 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it('maps a stale identity version to RESOURCE_STATE_CONFLICT with no partial state', async () => {
    const fixture = createFixture({
      snapshot: buildIdentity(),
      saveError: new OptimisticConcurrencyError('Identity'),
    });
    await expect(
      fixture.service.regenerate({ identityId, expectedIdentityVersion: 2 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
  });

  it('never persists raw recovery codes in any form', async () => {
    const fixture = createFixture({ snapshot: buildIdentity() });
    await fixture.service.regenerate({ identityId, expectedIdentityVersion: 4 });

    const changeSet = fixture.save.mock.calls[0]?.[0];
    for (const code of changeSet?.recoveryCodes ?? []) {
      expect(ISSUED_CODES.some((issued) => issued.rawValue === code.properties.codeDigest.value)).toBe(
        false,
      );
    }
    // The identity write must also carry the bumped aggregate version.
    expect(changeSet?.identity.properties.aggregateVersion.value).toBe(5);
  });
});
