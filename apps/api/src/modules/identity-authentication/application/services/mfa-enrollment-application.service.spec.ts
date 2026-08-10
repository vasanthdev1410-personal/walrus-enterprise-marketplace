/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { Identity } from '../../domain/identity/entities/identity';
import { MfaEnrollment } from '../../domain/identity/entities/mfa-enrollment';
import { MfaFactor } from '../../domain/identity/entities/mfa-factor';
import { RecoveryCodeRecord } from '../../domain/identity/entities/recovery-code-record';
import { RecoveryCodeSet } from '../../domain/identity/entities/recovery-code-set';
import type {
  IdentityAggregateChangeSet,
  IdentityAuthenticationSnapshot,
  IdentityRepository,
  RecoveryCodeSetsSnapshot,
} from '../../domain/identity/repositories/identity-repository';
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { VerificationChallenge } from '../../domain/verification/entities/verification-challenge';
import type {
  CompleteMfaEnrollmentChallengePersistenceCommand,
  RejectTotpChallengePersistenceCommand,
  VerificationAggregateChangeSet,
  VerificationChallengeRepository,
} from '../../domain/verification/repositories/verification-challenge-repository';
import { MfaError } from '../errors/mfa.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { ProtectedEnvelope } from '../ports/envelope-encryption.port';
import type { TotpCryptographicPort } from '../ports/totp-cryptographic.port';
import { MfaEnrollmentApplicationService } from './mfa-enrollment-application.service';

const identityId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ab');
const enrollmentId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ac');
const factorId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ad');
const challengeId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ae');
const nextEnrollmentId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890b1');
const nextFactorId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890b2');
const nextChallengeId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890b3');
const nextAttemptId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890b4');
const now = new Date('2026-08-05T00:00:00.000Z');

const TEST_ENVELOPE: ProtectedEnvelope = {
  envelopeVersion: 'walrus-envelope-v1',
  algorithm: 'AES-256-GCM',
  kekVersion: 'test-v1',
  ciphertext: 'ciphertext',
  nonce: 'nonce',
  authenticationTag: 'tag',
  encryptedDek: 'dek',
  dekNonce: 'dek-nonce',
  dekAuthenticationTag: 'dek-tag',
};

describe('MfaEnrollmentApplicationService', () => {
  it('M01-MFA-001 starts a purpose-bound TOTP enrollment and persists it version-safely', async () => {
    const fixture = createFixture({ snapshot: buildSnapshot([]) });

    const result = await fixture.service.startEnrollment({
      identityId,
      expectedIdentityVersion: 4,
      factorType: 'TOTP_AUTHENTICATOR',
    });

    expect(result).toEqual({
      enrollmentId: nextEnrollmentId.value,
      enrollmentState: 'PENDING_VERIFICATION',
      protectedSetupMaterial: { secret: 'BASE32SECRET' },
      expiresAt: new Date(now.getTime() + 300_000),
      version: 1,
    });
    const saved = lastSaveCall(fixture);
    const [enrollment] = saved.changeSet.mfaEnrollments;
    const [factor] = saved.changeSet.mfaFactors;
    expect(saved.expectedVersion.value).toBe(4);
    expect(saved.changeSet.identity.properties.aggregateVersion.value).toBe(5);
    expect(enrollment?.properties.enrollmentState).toBe('PENDING_VERIFICATION');
    expect(factor?.properties.encryptedSecretOrReference.value).toBe(JSON.stringify(TEST_ENVELOPE));
    expect(factor?.properties.encryptionKeyVersion).toBe('test-v1');
    const inserted = lastInsertCall(fixture);
    expect(inserted.challenge.properties.purpose).toBe('MFA_ENROLLMENT');
    expect(inserted.challenge.properties.channelType).toBe('AUTHENTICATOR_APPLICATION');
    expect(inserted.challenge.properties.identityId?.value).toBe(identityId.value);
    expect(inserted.challenge.properties.maximumAttempts).toBe(5);
    expect(inserted.challenge.properties.aggregateVersion.value).toBe(1);
    expect(inserted.otpEvidence).toEqual([]);
  });

  it('M01-MFA-001 rejects an unsupported factor type', async () => {
    const fixture = createFixture({ snapshot: buildSnapshot([]) });
    await expect(
      fixture.service.startEnrollment({
        identityId,
        expectedIdentityVersion: 4,
        factorType: 'UNSUPPORTED',
      }),
    ).rejects.toEqual(new MfaError('MFA_ENROLLMENT_NOT_PERMITTED'));
  });

  it('M01-MFA-001 rejects enrollment for a non-ACTIVE identity', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([], [], buildIdentity('LOCKED', 'VERIFIED')),
    });
    await expect(
      fixture.service.startEnrollment({
        identityId,
        expectedIdentityVersion: 4,
        factorType: 'TOTP_AUTHENTICATOR',
      }),
    ).rejects.toEqual(new MfaError('MFA_ENROLLMENT_NOT_PERMITTED'));
    expect(fixture.saveIdentity).not.toHaveBeenCalled();
  });

  it('M01-MFA-001 rejects enrollment when an ACTIVE enrollment exists', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot(
        [buildEnrollment('ACTIVE', { activatedAt: now })],
        [buildFactor('ACTIVE', factorId, enrollmentId, { verifiedAt: now })],
      ),
    });
    await expect(
      fixture.service.startEnrollment({
        identityId,
        expectedIdentityVersion: 4,
        factorType: 'TOTP_AUTHENTICATOR',
      }),
    ).rejects.toEqual(new MfaError('MFA_ENROLLMENT_NOT_PERMITTED'));
  });

  it('M01-MFA-001 rejects enrollment while a live enrollment challenge is outstanding', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
      activeChallenge: buildChallenge(),
    });
    await expect(
      fixture.service.startEnrollment({
        identityId,
        expectedIdentityVersion: 4,
        factorType: 'TOTP_AUTHENTICATOR',
      }),
    ).rejects.toEqual(new MfaError('MFA_ENROLLMENT_NOT_PERMITTED'));
    expect(fixture.saveIdentity).not.toHaveBeenCalled();
  });

  it('M01-MFA-001 supersedes a stale pending enrollment whose challenge has lapsed', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
      activeChallenge: null,
    });

    await fixture.service.startEnrollment({
      identityId,
      expectedIdentityVersion: 4,
      factorType: 'TOTP_AUTHENTICATOR',
    });

    const saved = lastSaveCall(fixture);
    const enrollments = saved.changeSet.mfaEnrollments;
    const factors = saved.changeSet.mfaFactors;
    expect(enrollments).toHaveLength(2);
    const disabled = enrollments.find((e) => e.properties.mfaEnrollmentId.value === enrollmentId.value);
    expect(disabled?.properties.enrollmentState).toBe('DISABLED');
    expect(disabled?.properties.disabledAt).toEqual(now);
    expect(
      enrollments.find((e) => e.properties.mfaEnrollmentId.value === nextEnrollmentId.value),
    ).toBeDefined();
    const revoked = factors.find((f) => f.properties.mfaFactorId.value === factorId.value);
    expect(revoked?.properties.factorState).toBe('REVOKED');
    expect(revoked?.properties.revokedAt).toEqual(now);
  });

  it('M01-MFA-001 maps a stale identity version to RESOURCE_STATE_CONFLICT', async () => {
    const fixture = createFixture({ snapshot: buildSnapshot([]) });
    fixture.saveIdentity.mockRejectedValueOnce(new OptimisticConcurrencyError('Identity'));
    await expect(
      fixture.service.startEnrollment({
        identityId,
        expectedIdentityVersion: 3,
        factorType: 'TOTP_AUTHENTICATOR',
      }),
    ).rejects.toEqual(new MfaError('RESOURCE_STATE_CONFLICT'));
    expect(fixture.insertChallenge).not.toHaveBeenCalled();
  });

  it('M01-MFA-002 activates the factor and enrollment atomically on a valid TOTP', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
      activeChallenge: buildChallenge(),
    });
    fixture.verifyTotp.mockReturnValue({ valid: true, matchedTimeStep: 300n });

    const result = await fixture.service.confirmEnrollment({
      identityId,
      enrollmentId,
      expectedEnrollmentVersion: 1,
      verificationEvidence: '123456',
    });

    expect(result).toEqual({
      enrollmentId: enrollmentId.value,
      enrollmentState: 'ACTIVE',
      recoveryCodes: [],
      version: 2,
    });
    const completion = lastCompletionCall(fixture);
    expect(completion.enrollmentId.value).toBe(enrollmentId.value);
    expect(completion.factorId.value).toBe(factorId.value);
    expect(completion.candidateTimeStep).toBe(300n);
    expect(completion.expectedVersion.value).toBe(1);
    expect(completion.attempt.properties.outcome).toBe('SUCCEEDED');
    expect(fixture.rejectChallenge).not.toHaveBeenCalled();
  });

  it('M01-MFA-002 rejects an unknown enrollment without revealing state', async () => {
    const fixture = createFixture({ snapshot: buildSnapshot([]) });
    await expect(
      fixture.service.confirmEnrollment({
        identityId,
        enrollmentId,
        expectedEnrollmentVersion: 1,
        verificationEvidence: '123456',
      }),
    ).rejects.toEqual(new MfaError('CHALLENGE_INVALID_OR_EXPIRED'));
  });

  it('M01-MFA-002 rejects confirmation of an already-ACTIVE enrollment', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot(
        [buildEnrollment('ACTIVE', { activatedAt: now })],
        [buildFactor('ACTIVE', factorId, enrollmentId, { verifiedAt: now })],
      ),
      activeChallenge: buildChallenge(),
    });
    await expect(
      fixture.service.confirmEnrollment({
        identityId,
        enrollmentId,
        expectedEnrollmentVersion: 1,
        verificationEvidence: '123456',
      }),
    ).rejects.toEqual(new MfaError('RESOURCE_STATE_CONFLICT'));
  });

  it('M01-MFA-002 rejects a stale enrollment version (If-Match) with RESOURCE_STATE_CONFLICT', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
      activeChallenge: buildChallenge(),
    });
    await expect(
      fixture.service.confirmEnrollment({
        identityId,
        enrollmentId,
        expectedEnrollmentVersion: 2,
        verificationEvidence: '123456',
      }),
    ).rejects.toEqual(new MfaError('RESOURCE_STATE_CONFLICT'));
    expect(fixture.completeEnrollment).not.toHaveBeenCalled();
  });

  it('M01-MFA-002 rejects an expired challenge', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
      activeChallenge: buildChallenge(0, new Date(now.getTime() - 1_000)),
    });
    await expect(
      fixture.service.confirmEnrollment({
        identityId,
        enrollmentId,
        expectedEnrollmentVersion: 1,
        verificationEvidence: '123456',
      }),
    ).rejects.toEqual(new MfaError('CHALLENGE_INVALID_OR_EXPIRED'));
  });

  it('M01-MFA-002 rejects a challenge bound to a different enrollment', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
      activeChallenge: buildChallenge(0, new Date(now.getTime() + 300_000), nextEnrollmentId),
    });
    await expect(
      fixture.service.confirmEnrollment({
        identityId,
        enrollmentId,
        expectedEnrollmentVersion: 1,
        verificationEvidence: '123456',
      }),
    ).rejects.toEqual(new MfaError('CHALLENGE_INVALID_OR_EXPIRED'));
  });

  it('M01-MFA-002 rejects invalid TOTP evidence and fails the challenge at the attempt bound', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
      activeChallenge: buildChallenge(4),
    });
    fixture.verifyTotp.mockReturnValue({ valid: false });

    await expect(
      fixture.service.confirmEnrollment({
        identityId,
        enrollmentId,
        expectedEnrollmentVersion: 5,
        verificationEvidence: '000000',
      }),
    ).rejects.toEqual(new MfaError('CHALLENGE_INVALID_OR_EXPIRED'));

    const rejection = lastRejectCall(fixture);
    expect(rejection.terminal).toBe(true);
    expect(rejection.attempt.properties.outcome).toBe('FAILED_SECURELY');
    expect(fixture.completeEnrollment).not.toHaveBeenCalled();
  });

  it('M01-MFA-002 records a non-terminal rejected attempt without failing the challenge', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
      activeChallenge: buildChallenge(1),
    });
    fixture.verifyTotp.mockReturnValue({ valid: false });

    await expect(
      fixture.service.confirmEnrollment({
        identityId,
        enrollmentId,
        expectedEnrollmentVersion: 2,
        verificationEvidence: '000000',
      }),
    ).rejects.toEqual(new MfaError('CHALLENGE_INVALID_OR_EXPIRED'));

    const rejection = lastRejectCall(fixture);
    expect(rejection.terminal).toBe(false);
    expect(rejection.attempt.properties.outcome).toBe('REJECTED');
  });

  it('M01-MFA-002 maps an atomic-completion failure to CHALLENGE_INVALID_OR_EXPIRED', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
      activeChallenge: buildChallenge(),
    });
    fixture.verifyTotp.mockReturnValue({ valid: true, matchedTimeStep: 300n });
    fixture.completeEnrollment.mockResolvedValueOnce(false);

    await expect(
      fixture.service.confirmEnrollment({
        identityId,
        enrollmentId,
        expectedEnrollmentVersion: 1,
        verificationEvidence: '123456',
      }),
    ).rejects.toEqual(new MfaError('CHALLENGE_INVALID_OR_EXPIRED'));
  });

  it('M01-MFA-003 reports NOT_ENROLLED with no MFA state for a fresh identity', async () => {
    const fixture = createFixture({ snapshot: buildSnapshot([]) });
    await expect(fixture.service.readStatus(identityId)).resolves.toEqual({
      enrollmentState: 'NOT_ENROLLED',
      activeFactorTypes: [],
      replacementRequired: false,
      recoveryCodeCount: 0,
      version: 0,
    });
  });

  it('M01-MFA-003 reports the ACTIVE enrollment and active factor types, never secrets', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot(
        [buildEnrollment('ACTIVE', { activatedAt: now })],
        [buildFactor('ACTIVE', factorId, enrollmentId, { verifiedAt: now })],
      ),
    });
    await expect(fixture.service.readStatus(identityId)).resolves.toEqual({
      enrollmentState: 'ACTIVE',
      activeFactorTypes: ['TOTP_AUTHENTICATOR'],
      replacementRequired: false,
      recoveryCodeCount: 0,
      version: 2,
    });
  });

  it('M01-MFA-003 reports a pending enrollment at version 1', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('PENDING_VERIFICATION')], [buildFactor()]),
    });
    await expect(fixture.service.readStatus(identityId)).resolves.toMatchObject({
      enrollmentState: 'PENDING_VERIFICATION',
      version: 1,
    });
  });

  it('M01-MFA-003 flags replacementRequired when the enrollment requires replacement', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot([buildEnrollment('REPLACEMENT_REQUIRED', { replacementRequiredAt: now })]),
    });
    await expect(fixture.service.readStatus(identityId)).resolves.toMatchObject({
      enrollmentState: 'REPLACEMENT_REQUIRED',
      replacementRequired: true,
      version: 2,
    });
  });

  it('M01-MFA-003 reports ACTIVE recovery codes in the current ACTIVE set', async () => {
    const setVersion = new RecoveryCodeSet({
      recoveryCodeSetId: new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890c1'),
      identityId,
      setVersion: 2,
      setState: 'ACTIVE',
      createdAt: now,
    });
    const activeCodes = Array.from({ length: 8 }, (_, index) => {
      const suffix = (index + 1).toString().padStart(12, '0');
      return new RecoveryCodeRecord({
        recoveryCodeId: new UuidV7(`01890f3e-7b5a-7cc0-8c9d-${suffix}`),
        recoveryCodeSetId: setVersion.properties.recoveryCodeSetId,
        codeDigest: new ProtectedValue(`digest-${String(index + 1)}`),
        codeState: 'ACTIVE',
        createdAt: now,
      });
    });
    const consumed = new RecoveryCodeRecord({
      recoveryCodeId: new UuidV7('01890f3e-7b5a-7cc0-8c9d-000000000099'),
      recoveryCodeSetId: setVersion.properties.recoveryCodeSetId,
      codeDigest: new ProtectedValue('digest-consumed'),
      codeState: 'CONSUMED',
      createdAt: now,
      consumedAt: now,
    });
    const fixture = createFixture({
      snapshot: buildSnapshot(
        [buildEnrollment('ACTIVE', { activatedAt: now })],
        [buildFactor('ACTIVE', factorId, enrollmentId, { verifiedAt: now })],
      ),
      recoverySets: {
        recoveryCodeSets: [setVersion],
        recoveryCodes: [...activeCodes, consumed],
      },
    });

    await expect(fixture.service.readStatus(identityId)).resolves.toMatchObject({
      enrollmentState: 'ACTIVE',
      recoveryCodeCount: 8,
    });
  });

  it('M01-MFA-003 reports zero recovery codes when only a superseded set exists', async () => {
    const fixture = createFixture({
      snapshot: buildSnapshot(
        [buildEnrollment('ACTIVE', { activatedAt: now })],
        [buildFactor('ACTIVE', factorId, enrollmentId, { verifiedAt: now })],
      ),
      recoverySets: {
        recoveryCodeSets: [
          new RecoveryCodeSet({
            recoveryCodeSetId: new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890c2'),
            identityId,
            setVersion: 1,
            setState: 'SUPERSEDED',
            createdAt: now,
            invalidatedAt: now,
            invalidationReason: 'REGENERATED',
          }),
        ],
        recoveryCodes: [],
      },
    });

    await expect(fixture.service.readStatus(identityId)).resolves.toMatchObject({
      recoveryCodeCount: 0,
    });
  });
});

interface Fixture {
  readonly service: MfaEnrollmentApplicationService;
  readonly saveIdentity: jest.MockedFunction<IdentityRepository['save']>;
  readonly insertChallenge: jest.MockedFunction<VerificationChallengeRepository['insert']>;
  readonly findActiveByBinding: jest.MockedFunction<
    VerificationChallengeRepository['findActiveByBinding']
  >;
  readonly rejectChallenge: jest.MockedFunction<
    VerificationChallengeRepository['rejectTotpChallenge']
  >;
  readonly completeEnrollment: jest.MockedFunction<
    VerificationChallengeRepository['completeMfaEnrollmentChallenge']
  >;
  readonly createSecret: jest.MockedFunction<TotpCryptographicPort['createEnrollmentSecret']>;
  readonly verifyTotp: jest.MockedFunction<TotpCryptographicPort['verify']>;
}

interface FixtureOptions {
  readonly snapshot: IdentityAuthenticationSnapshot;
  readonly activeChallenge?: VerificationChallenge | null;
  readonly recoverySets?: RecoveryCodeSetsSnapshot | null;
}

function createFixture(options: FixtureOptions): Fixture {
  const findRecoveryCodeSets = jest
    .fn()
    .mockResolvedValue(
      options.recoverySets ?? { recoveryCodeSets: [], recoveryCodes: [] },
    );
  const identities = {
    findAuthenticationById: jest.fn().mockResolvedValue(options.snapshot),
    findRecoveryCodeSets,
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<IdentityRepository>;
  const insertChallenge: jest.MockedFunction<VerificationChallengeRepository['insert']> =
    jest.fn().mockResolvedValue(undefined);
  const findActiveByBinding: jest.MockedFunction<
    VerificationChallengeRepository['findActiveByBinding']
  > = jest.fn().mockResolvedValue(options.activeChallenge ?? null);
  const rejectChallenge: jest.MockedFunction<
    VerificationChallengeRepository['rejectTotpChallenge']
  > = jest.fn().mockResolvedValue(true);
  const completeEnrollment: jest.MockedFunction<
    VerificationChallengeRepository['completeMfaEnrollmentChallenge']
  > = jest.fn().mockResolvedValue(true);
  const challenges = {
    findById: jest.fn(),
    findAggregateById: jest.fn(),
    findActiveByBinding,
    expireActiveChallengesForIdentity: jest.fn(),
    insert: insertChallenge,
    save: jest.fn(),
    completeTotpChallenge: jest.fn(),
    completeMfaEnrollmentChallenge: completeEnrollment,
    rejectTotpChallenge: rejectChallenge,
    confirmOtpChallenge: jest.fn(),
    rejectOtpChallenge: jest.fn(),
  } as unknown as jest.Mocked<VerificationChallengeRepository>;
  const createSecret: jest.MockedFunction<TotpCryptographicPort['createEnrollmentSecret']> =
    jest.fn().mockReturnValue({ base32Secret: 'BASE32SECRET', protectedEnvelope: TEST_ENVELOPE });
  const verifyTotp: jest.MockedFunction<TotpCryptographicPort['verify']> = jest
    .fn()
    .mockReturnValue({ valid: true, matchedTimeStep: 300n });
  const totp: jest.Mocked<TotpCryptographicPort> = {
    createEnrollmentSecret: createSecret,
    verify: verifyTotp,
  };
  const clock: ClockPort = { now: () => now };
  const generated = [nextEnrollmentId, nextFactorId, nextChallengeId, nextAttemptId];
  const identifiers: UuidV7GenerationPort = {
    next: () => generated.shift() ?? nextAttemptId,
  };
  return {
    service: new MfaEnrollmentApplicationService(
      identities,
      challenges,
      totp,
      clock,
      identifiers,
      { environment: 'test', challengeLifetimeSeconds: 300, maximumVerificationAttempts: 5 },
    ),
    saveIdentity: identities.save,
    insertChallenge,
    findActiveByBinding,
    rejectChallenge,
    completeEnrollment,
    createSecret,
    verifyTotp,
  };
}

function lastSaveCall(fixture: Fixture): {
  readonly changeSet: IdentityAggregateChangeSet;
  readonly expectedVersion: AggregateVersion;
} {
  const call = fixture.saveIdentity.mock.calls.at(-1) as
    | [IdentityAggregateChangeSet, AggregateVersion]
    | undefined;
  if (call === undefined) throw new Error('IdentityRepository.save was not called');
  return { changeSet: call[0], expectedVersion: call[1] };
}

function lastInsertCall(
  fixture: Fixture,
): VerificationAggregateChangeSet {
  const call = fixture.insertChallenge.mock.calls.at(-1) as
    | [VerificationAggregateChangeSet]
    | undefined;
  if (call === undefined) throw new Error('VerificationChallengeRepository.insert was not called');
  return call[0];
}

function lastCompletionCall(
  fixture: Fixture,
): CompleteMfaEnrollmentChallengePersistenceCommand {
  const call = fixture.completeEnrollment.mock.calls.at(-1) as
    | [CompleteMfaEnrollmentChallengePersistenceCommand]
    | undefined;
  if (call === undefined) {
    throw new Error('VerificationChallengeRepository.completeMfaEnrollmentChallenge was not called');
  }
  return call[0];
}

function lastRejectCall(fixture: Fixture): RejectTotpChallengePersistenceCommand {
  const call = fixture.rejectChallenge.mock.calls.at(-1) as
    | [RejectTotpChallengePersistenceCommand]
    | undefined;
  if (call === undefined) throw new Error('VerificationChallengeRepository.rejectTotpChallenge was not called');
  return call[0];
}

function buildIdentity(
  identityState: 'ACTIVE' | 'LOCKED' = 'ACTIVE',
  verificationState: 'VERIFIED' | 'PENDING_VERIFICATION' = 'VERIFIED',
  aggregateVersion = 4,
): Identity {
  return new Identity({
    identityId,
    identityState,
    verificationState,
    aggregateVersion: new AggregateVersion(aggregateVersion),
    createdAt: new Date(now.getTime() - 86_400_000),
    updatedAt: now,
  });
}

function buildSnapshot(
  mfaEnrollments: readonly MfaEnrollment[],
  mfaFactors?: readonly MfaFactor[],
  identity: Identity = buildIdentity(),
): IdentityAuthenticationSnapshot {
  const factors =
    mfaFactors ??
    mfaEnrollments.flatMap((enrollment) => [
      buildFactor('PENDING_VERIFICATION', factorId, enrollment.properties.mfaEnrollmentId),
    ]);
  return Object.freeze({
    identity,
    identifiers: Object.freeze([]),
    credentials: Object.freeze([]),
    classificationAssignments: Object.freeze([]),
    mfaEnrollments: Object.freeze(mfaEnrollments),
    mfaFactors: Object.freeze(factors),
  });
}

function buildEnrollment(
  enrollmentState:
    | 'PENDING_VERIFICATION'
    | 'ACTIVE'
    | 'REPLACEMENT_REQUIRED' = 'PENDING_VERIFICATION',
  timestamps: Partial<{ activatedAt: Date; replacementRequiredAt: Date }> = {},
): MfaEnrollment {
  return new MfaEnrollment({
    mfaEnrollmentId: enrollmentId,
    identityId,
    enrollmentState,
    createdAt: new Date(now.getTime() - 300_000),
    updatedAt: now,
    ...timestamps,
  });
}

function buildFactor(
  factorState: 'PENDING_VERIFICATION' | 'ACTIVE' = 'PENDING_VERIFICATION',
  factor: UuidV7 = factorId,
  enrollment: UuidV7 = enrollmentId,
  timestamps: Partial<{ verifiedAt: Date }> = {},
): MfaFactor {
  return new MfaFactor({
    mfaFactorId: factor,
    mfaEnrollmentId: enrollment,
    factorType: 'TOTP_AUTHENTICATOR',
    factorState,
    encryptedSecretOrReference: new ProtectedValue(JSON.stringify(TEST_ENVELOPE)),
    encryptionKeyVersion: 'test-v1',
    createdAt: new Date(now.getTime() - 300_000),
    updatedAt: now,
    ...timestamps,
  });
}

function buildChallenge(
  attemptCount = 0,
  expiresAt = new Date(now.getTime() + 300_000),
  boundEnrollmentId: UuidV7 = enrollmentId,
): VerificationChallenge {
  return new VerificationChallenge({
    challengeId,
    identityId,
    purpose: 'MFA_ENROLLMENT',
    channelType: 'AUTHENTICATOR_APPLICATION',
    protectedDestinationReference: new ProtectedValue(
      `mfa-enrollment:${boundEnrollmentId.value}`,
    ),
    challengeDigest: new ProtectedValue(`mfa-enrollment-challenge:${challengeId.value}`),
    challengeState: 'CHALLENGE_ISSUED',
    attemptCount,
    maximumAttempts: 5,
    expiresAt,
    aggregateVersion: new AggregateVersion(attemptCount + 1),
    createdAt: new Date(now.getTime() - 300_000),
    updatedAt: now,
  });
}
