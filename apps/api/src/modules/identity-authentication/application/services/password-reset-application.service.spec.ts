/* eslint-disable @typescript-eslint/unbound-method */
import { Credential } from '../../domain/identity/entities/credential';
import { Identity } from '../../domain/identity/entities/identity';
import { IdentityIdentifier } from '../../domain/identity/entities/identity-identifier';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { IdentityState } from '../../domain/identity/value-objects/identity-state';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { OtpEvidenceRecord } from '../../domain/verification/entities/otp-evidence-record';
import { VerificationChallenge } from '../../domain/verification/entities/verification-challenge';
import type { VerificationChallengeProperties } from '../../domain/verification/entities/verification-challenge';
import type {
  VerificationChallengeAggregate,
  VerificationChallengeRepository,
} from '../../domain/verification/repositories/verification-challenge-repository';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import type { OtpDeliveryPort } from '../ports/otp-delivery.port';
import type { OtpRecoveryCodeCryptographicPort } from '../ports/otp-recovery-code-cryptographic.port';
import type { PasswordHashingPort } from '../ports/password-hashing.port';
import { PasswordResetApplicationService } from './password-reset-application.service';

const IDENTITY_ID = '0191310f-789a-7123-8123-000000000001';
const CHALLENGE_ID = '0191310f-789a-7123-8123-000000000002';
const EVIDENCE_ID = '0191310f-789a-7123-8123-000000000003';
const ATTEMPT_ID = '0191310f-789a-7123-8123-000000000004';
const CREDENTIAL_ID = '0191310f-789a-7123-8123-000000000005';
const HISTORY_ID = '0191310f-789a-7123-8123-000000000006';
const PASSWORD_HISTORY_ID = '0191310f-789a-7123-8123-000000000007';
const NEW_CREDENTIAL_ID = '0191310f-789a-7123-8123-000000000008';
const CONCEALED_ID = '0191310f-789a-7123-8123-000000000099';
const FIXED_NOW = new Date('2026-08-08T12:00:00.000Z');
const VERIFIED_DESTINATION = 'user@example.com';

const UUID_QUEUE: string[] = [];

function nextUuid(): UuidV7 {
  const value = UUID_QUEUE.shift() ?? CONCEALED_ID;
  return new UuidV7(value);
}

function buildSnapshot(
  identityState: IdentityState = 'ACTIVE',
  verificationState: 'PENDING_VERIFICATION' | 'VERIFIED' = 'VERIFIED',
): IdentityAuthenticationSnapshot {
  return {
    identity: new Identity({
      identityId: new UuidV7(IDENTITY_ID),
      identityState,
      verificationState,
      aggregateVersion: new AggregateVersion(2),
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    }),
    identifiers: [
      new IdentityIdentifier({
        identifierId: new UuidV7('0191310f-789a-7123-8123-000000000010'),
        identityId: new UuidV7(IDENTITY_ID),
        identifierType: 'EMAIL',
        protectedNormalizedValue: new ProtectedValue(VERIFIED_DESTINATION),
        lookupDigest: new ProtectedValue('lookup:v2:digest'),
        lookupKeyVersion: 'v1',
        verificationState: 'VERIFIED',
        isPrimary: true,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        verifiedAt: FIXED_NOW,
      }),
    ],
    credentials: [
      new Credential({
        credentialId: new UuidV7(CREDENTIAL_ID),
        identityId: new UuidV7(IDENTITY_ID),
        credentialType: 'PASSWORD',
        credentialVersion: 3,
        credentialState: 'ACTIVE',
        protectedSecret: new ProtectedValue('current-hash'),
        protectionKeyVersion: 'v1',
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      }),
    ],
    classificationAssignments: [],
    mfaEnrollments: [],
    mfaFactors: [],
  };
}

function buildChallengeAggregate(
  overrides: Partial<VerificationChallengeProperties> = {},
): VerificationChallengeAggregate {
  const challenge = new VerificationChallenge({
    challengeId: new UuidV7(CHALLENGE_ID),
    identityId: new UuidV7(IDENTITY_ID),
    purpose: 'PASSWORD_RECOVERY',
    channelType: 'EMAIL',
    protectedDestinationReference: new ProtectedValue(VERIFIED_DESTINATION),
    challengeDigest: new ProtectedValue('stored-otp-digest'),
    challengeState: 'CHALLENGE_ISSUED',
    attemptCount: 0,
    maximumAttempts: 5,
    expiresAt: new Date(FIXED_NOW.getTime() + 300_000),
    aggregateVersion: new AggregateVersion(1),
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  });
  const evidence = new OtpEvidenceRecord({
    otpEvidenceId: new UuidV7(EVIDENCE_ID),
    challengeId: challenge.properties.challengeId,
    evidenceDigest: new ProtectedValue('stored-otp-digest'),
    evidenceState: 'ACTIVE',
    expiresAt: challenge.properties.expiresAt,
    createdAt: challenge.properties.createdAt,
  });
  return { challenge, otpEvidence: [evidence] };
}

interface PasswordResetFixture {
  readonly service: PasswordResetApplicationService;
  readonly identityRepository: jest.Mocked<IdentityRepository>;
  readonly sessionRepository: jest.Mocked<SessionRepository>;
  readonly verificationChallenges: jest.Mocked<VerificationChallengeRepository>;
  readonly passwordHashing: jest.Mocked<PasswordHashingPort>;
  readonly otpCrypto: jest.Mocked<OtpRecoveryCodeCryptographicPort>;
  readonly otpDelivery: jest.Mocked<OtpDeliveryPort>;
}

function createFixture(): PasswordResetFixture {
  const identityRepository: jest.Mocked<IdentityRepository> = {
    findById: jest.fn(),
    findPasswordHistory: jest.fn().mockResolvedValue([]),
    findRecoveryCodeSets: jest.fn(),
    findAuthenticationById: jest.fn(),
    findByIdentifierLookups: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
    advanceTotpReplayState: jest.fn(),
  };

  const sessionRepository: jest.Mocked<SessionRepository> = {
    findById: jest.fn(),
    findByRefreshTokenDigest: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeRefreshTokenFamilyForReuse: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllSessions: jest.fn(),
    revokeAllSessionsForRecovery: jest.fn().mockResolvedValue(1),
    insert: jest.fn(),
    save: jest.fn(),
  };

  const verificationChallenges: jest.Mocked<VerificationChallengeRepository> = {
    findById: jest.fn(),
    findAggregateById: jest.fn(),
    findActiveByBinding: jest.fn().mockResolvedValue(null),
    insert: jest.fn(),
    save: jest.fn(),
    completeTotpChallenge: jest.fn(),
    rejectTotpChallenge: jest.fn(),
    confirmOtpChallenge: jest.fn().mockResolvedValue(true),
    rejectOtpChallenge: jest.fn().mockResolvedValue(true),
    expireActiveChallengesForIdentity: jest.fn().mockResolvedValue(0),
    completeMfaEnrollmentChallenge: jest.fn(),
  };

  const passwordHashing: jest.Mocked<PasswordHashingPort> = {
    hash: jest.fn().mockResolvedValue('new-hash'),
    verify: jest.fn().mockResolvedValue(false),
    verifyForAuthentication: jest.fn(),
    needsRehash: jest.fn(),
  };

  const identifierLookup: jest.Mocked<IdentifierLookupCryptographicPort> = {
    createActiveLookup: jest.fn().mockReturnValue('lookup:v2:digest'),
    createLookupsForResolution: jest.fn().mockReturnValue(['lookup:v2:digest']),
  };

  const otpCrypto: jest.Mocked<OtpRecoveryCodeCryptographicPort> = {
    issueOtp: jest
      .fn()
      .mockReturnValue({ rawValue: '123456', digest: 'stored-otp-digest', keyVersion: 'v1' }),
    matchesOtp: jest.fn().mockReturnValue(true),
    issueRecoveryCodeSet: jest.fn(),
    matchesRecoveryCode: jest.fn(),
  };

  const otpDelivery: jest.Mocked<OtpDeliveryPort> = {
    deliver: jest.fn().mockResolvedValue(undefined),
  };

  const clock = { now: () => FIXED_NOW };
  const identifiers = { next: () => nextUuid() };

  const service = new PasswordResetApplicationService(
    identityRepository,
    sessionRepository,
    verificationChallenges,
    passwordHashing,
    identifierLookup,
    otpCrypto,
    otpDelivery,
    clock,
    identifiers,
    {
      environment: 'local',
      otpLifetimeSeconds: 300,
      maximumVerificationAttempts: 5,
      minimumPasswordLength: 8,
      maximumPasswordLength: 1024,
      passwordHistoryDepth: 5,
    },
  );

  return {
    service,
    identityRepository,
    sessionRepository,
    verificationChallenges,
    passwordHashing,
    otpCrypto,
    otpDelivery,
  };
}

describe('PasswordResetApplicationService', () => {
  beforeEach(() => {
    UUID_QUEUE.length = 0;
    UUID_QUEUE.push(
      CHALLENGE_ID,
      EVIDENCE_ID,
      ATTEMPT_ID,
      NEW_CREDENTIAL_ID,
      HISTORY_ID,
      PASSWORD_HISTORY_ID,
    );
  });

  describe('requestReset (M01-CRED-002)', () => {
    it('conceals the request when the identifier does not resolve to an identity', async () => {
      UUID_QUEUE.length = 0;
      const fixture = createFixture();
      fixture.identityRepository.findByIdentifierLookups.mockResolvedValue(null);

      const result = await fixture.service.requestReset({
        identifier: 'unknown@example.com',
        channelType: 'EMAIL',
      });

      expect(result.issued).toBe(false);
      expect(result.challengeId).toBe(CONCEALED_ID);
      expect(fixture.verificationChallenges.insert).not.toHaveBeenCalled();
      expect(fixture.otpDelivery.deliver).not.toHaveBeenCalled();
    });

    it('conceals the request when the identity is not eligible', async () => {
      const fixture = createFixture();
      fixture.identityRepository.findByIdentifierLookups.mockResolvedValue(
        buildSnapshot('PENDING_VERIFICATION', 'PENDING_VERIFICATION'),
      );

      const result = await fixture.service.requestReset({
        identifier: 'user@example.com',
        channelType: 'EMAIL',
      });

      expect(result.issued).toBe(false);
      expect(fixture.verificationChallenges.insert).not.toHaveBeenCalled();
    });

    it('conceals the request when the identity has no verified channel of the requested type', async () => {
      const fixture = createFixture();
      fixture.identityRepository.findByIdentifierLookups.mockResolvedValue(buildSnapshot());

      const result = await fixture.service.requestReset({
        identifier: '+15551234567',
        channelType: 'SMS',
      });

      expect(result.issued).toBe(false);
      expect(fixture.verificationChallenges.insert).not.toHaveBeenCalled();
    });

    it('issues a purpose-bound PASSWORD_RECOVERY challenge delivered to the stored verified destination', async () => {
      const fixture = createFixture();
      fixture.identityRepository.findByIdentifierLookups.mockResolvedValue(buildSnapshot());

      const result = await fixture.service.requestReset({
        identifier: 'user@example.com',
        channelType: 'EMAIL',
      });

      expect(result.issued).toBe(true);
      expect(result.challengeId).toBe(CHALLENGE_ID);
      expect(result.version).toBe(1);
      expect(fixture.verificationChallenges.insert).toHaveBeenCalledTimes(1);
      const changeSet = fixture.verificationChallenges.insert.mock.calls[0]?.[0];
      expect(changeSet?.challenge.properties.purpose).toBe('PASSWORD_RECOVERY');
      expect(changeSet?.challenge.properties.identityId?.value).toBe(IDENTITY_ID);
      expect(changeSet?.challenge.properties.protectedDestinationReference.value).toBe(
        VERIFIED_DESTINATION,
      );
      expect(fixture.otpDelivery.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: VERIFIED_DESTINATION,
          channel: 'EMAIL',
          purpose: 'PASSWORD_RECOVERY',
        }),
      );
    });

    it('returns the existing active challenge instead of issuing a second one', async () => {
      const fixture = createFixture();
      fixture.identityRepository.findByIdentifierLookups.mockResolvedValue(buildSnapshot());
      fixture.verificationChallenges.findActiveByBinding.mockResolvedValue(
        buildChallengeAggregate().challenge,
      );

      const result = await fixture.service.requestReset({
        identifier: 'user@example.com',
        channelType: 'EMAIL',
      });

      expect(result.issued).toBe(true);
      expect(result.challengeId).toBe(CHALLENGE_ID);
      expect(fixture.verificationChallenges.insert).not.toHaveBeenCalled();
      expect(fixture.otpDelivery.deliver).not.toHaveBeenCalled();
    });

    it('cancels the orphaned challenge when OTP delivery fails', async () => {
      const fixture = createFixture();
      fixture.identityRepository.findByIdentifierLookups.mockResolvedValue(buildSnapshot());
      fixture.otpDelivery.deliver.mockRejectedValue(new Error('provider down'));

      await expect(
        fixture.service.requestReset({ identifier: 'user@example.com', channelType: 'EMAIL' }),
      ).rejects.toThrow('provider down');

      const cancelled = fixture.verificationChallenges.save.mock.calls[0]?.[0];
      expect(cancelled?.challenge.properties.challengeState).toBe('CANCELLED');
    });
  });

  describe('confirmReset (M01-CRED-003)', () => {
    it('rejects a challenge that is not purpose-bound to PASSWORD_RECOVERY', async () => {
      const fixture = createFixture();
      fixture.verificationChallenges.findAggregateById.mockResolvedValue(
        buildChallengeAggregate({ purpose: 'CONTACT_CHANGE_VERIFICATION' }),
      );

      await expect(
        fixture.service.confirmReset({
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
          newPassword: 'NewSecurePass1!',
        }),
      ).rejects.toMatchObject({ code: 'RECOVERY_OPERATION_NOT_PERMITTED' });
    });

    it('rejects an expired challenge', async () => {
      const fixture = createFixture();
      fixture.verificationChallenges.findAggregateById.mockResolvedValue(
        buildChallengeAggregate({
          expiresAt: new Date(FIXED_NOW.getTime() - 1),
          createdAt: new Date(FIXED_NOW.getTime() - 600_000),
        }),
      );

      await expect(
        fixture.service.confirmReset({
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
          newPassword: 'NewSecurePass1!',
        }),
      ).rejects.toMatchObject({ code: 'RECOVERY_OPERATION_NOT_PERMITTED' });
    });

    it('rejects a stale version precondition', async () => {
      const fixture = createFixture();
      fixture.verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());

      await expect(
        fixture.service.confirmReset({
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
          verificationEvidence: '123456',
          newPassword: 'NewSecurePass1!',
        }),
      ).rejects.toMatchObject({ code: 'RECOVERY_STATE_CONFLICT' });
    });

    it('rejects a policy-invalid new password before consuming the evidence', async () => {
      const fixture = createFixture();
      fixture.verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());

      await expect(
        fixture.service.confirmReset({
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
          newPassword: 'short',
        }),
      ).rejects.toMatchObject({ code: 'PASSWORD_POLICY_FAILED' });

      expect(fixture.verificationChallenges.confirmOtpChallenge).not.toHaveBeenCalled();
      expect(fixture.passwordHashing.hash).not.toHaveBeenCalled();
    });

    it('rejects a password reused from history before consuming the evidence', async () => {
      const fixture = createFixture();
      fixture.verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      fixture.identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      fixture.passwordHashing.verify.mockResolvedValueOnce(true);

      await expect(
        fixture.service.confirmReset({
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
          newPassword: 'NewSecurePass1!',
        }),
      ).rejects.toMatchObject({ code: 'PASSWORD_POLICY_FAILED' });

      expect(fixture.verificationChallenges.confirmOtpChallenge).not.toHaveBeenCalled();
    });

    it('rejects an incorrect OTP with a uniform recovery outcome and records the attempt', async () => {
      const fixture = createFixture();
      fixture.verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      fixture.identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      fixture.otpCrypto.matchesOtp.mockReturnValue(false);

      await expect(
        fixture.service.confirmReset({
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '000000',
          newPassword: 'NewSecurePass1!',
        }),
      ).rejects.toMatchObject({ code: 'RECOVERY_OPERATION_NOT_PERMITTED' });

      expect(fixture.verificationChallenges.rejectOtpChallenge).toHaveBeenCalledTimes(1);
      expect(fixture.passwordHashing.hash).not.toHaveBeenCalled();
    });

    it('atomically replaces the credential, records history and revokes all sessions on success', async () => {
      UUID_QUEUE.length = 0;
      UUID_QUEUE.push(ATTEMPT_ID, NEW_CREDENTIAL_ID, HISTORY_ID, PASSWORD_HISTORY_ID);
      const fixture = createFixture();
      fixture.verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      fixture.identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());

      await fixture.service.confirmReset({
        challengeId: new UuidV7(CHALLENGE_ID),
        expectedChallengeVersion: 1,
        verificationEvidence: '123456',
        newPassword: 'NewSecurePass1!',
      });

      expect(fixture.verificationChallenges.confirmOtpChallenge).toHaveBeenCalledTimes(1);

      const changeSet = fixture.identityRepository.save.mock.calls[0]?.[0];
      const replaced = changeSet?.credentials.find(
        (credential) => credential.properties.credentialId.value === CREDENTIAL_ID,
      );
      const issued = changeSet?.credentials.find(
        (credential) => credential.properties.credentialId.value === NEW_CREDENTIAL_ID,
      );
      expect(replaced?.properties.credentialState).toBe('REPLACED');
      expect(issued?.properties.credentialState).toBe('ACTIVE');
      expect(issued?.properties.credentialVersion).toBe(4);
      expect(changeSet?.credentialHistoryToAppend).toHaveLength(1);
      expect(changeSet?.credentialHistoryToAppend[0]?.properties.eventType).toBe('REPLACED');
      expect(changeSet?.passwordHistoryToAppend).toHaveLength(1);
      expect(changeSet?.passwordHistoryToAppend[0]?.properties.passwordHash.value).toBe(
        'current-hash',
      );

      expect(fixture.verificationChallenges.expireActiveChallengesForIdentity).toHaveBeenCalledWith(
        new UuidV7(IDENTITY_ID),
        'PASSWORD_RECOVERY',
      );
      expect(fixture.sessionRepository.revokeAllSessionsForRecovery).toHaveBeenCalledWith(
        expect.objectContaining({
          identityId: new UuidV7(IDENTITY_ID),
          revocationReason: 'PASSWORD_RESET',
        }),
      );
    });

    it('surfaces a concurrent identity write as RECOVERY_STATE_CONFLICT', async () => {
      const fixture = createFixture();
      fixture.verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      fixture.identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      fixture.identityRepository.save.mockRejectedValue(new OptimisticConcurrencyError('identity'));

      await expect(
        fixture.service.confirmReset({
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
          newPassword: 'NewSecurePass1!',
        }),
      ).rejects.toMatchObject({ code: 'RECOVERY_STATE_CONFLICT' });
    });
  });
});
