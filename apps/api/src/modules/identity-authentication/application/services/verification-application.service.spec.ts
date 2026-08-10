import { Identity } from '../../domain/identity/entities/identity';
import { IdentityIdentifier } from '../../domain/identity/entities/identity-identifier';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { IdentityState } from '../../domain/identity/value-objects/identity-state';
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
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { VerificationError } from '../errors/verification.error';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import type { OtpDeliveryPort } from '../ports/otp-delivery.port';
import type { OtpRecoveryCodeCryptographicPort } from '../ports/otp-recovery-code-cryptographic.port';
import { VerificationApplicationService } from './verification-application.service';

const IDENTITY_ID = '0191310f-789a-7123-8123-000000000001';
const OTHER_IDENTITY_ID = '0191310f-789a-7123-8123-000000000088';
const CHALLENGE_ID = '0191310f-789a-7123-8123-000000000002';
const EVIDENCE_ID = '0191310f-789a-7123-8123-000000000003';
const ATTEMPT_ID = '0191310f-789a-7123-8123-000000000004';
const CONCEALED_ID = '0191310f-789a-7123-8123-000000000099';
const FIXED_NOW = new Date('2026-08-07T12:00:00.000Z');
const DESTINATION = 'new-contact@example.com';

const BASE_UUID_QUEUE = [CHALLENGE_ID, EVIDENCE_ID, ATTEMPT_ID];
const UUID_QUEUE: string[] = [];

function nextUuid(): UuidV7 {
  const value = UUID_QUEUE.shift() ?? CONCEALED_ID;
  return new UuidV7(value);
}

function buildSnapshot(
  identityState: IdentityState = 'ACTIVE',
  identityId = IDENTITY_ID,
): IdentityAuthenticationSnapshot {
  return {
    identity: new Identity({
      identityId: new UuidV7(identityId),
      identityState,
      verificationState: 'VERIFIED',
      aggregateVersion: new AggregateVersion(2),
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    }),
    identifiers: [
      new IdentityIdentifier({
        identifierId: new UuidV7('0191310f-789a-7123-8123-000000000010'),
        identityId: new UuidV7(identityId),
        identifierType: 'EMAIL',
        protectedNormalizedValue: new ProtectedValue('user@example.com'),
        lookupDigest: new ProtectedValue('existing-digest'),
        lookupKeyVersion: 'v1',
        verificationState: 'VERIFIED',
        isPrimary: true,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        verifiedAt: FIXED_NOW,
      }),
    ],
    credentials: [],
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
    purpose: 'CONTACT_CHANGE_VERIFICATION',
    channelType: 'EMAIL',
    protectedDestinationReference: new ProtectedValue(DESTINATION),
    challengeDigest: new ProtectedValue('stored-digest'),
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
    evidenceDigest: new ProtectedValue('stored-digest'),
    evidenceState: 'ACTIVE',
    expiresAt: challenge.properties.expiresAt,
    createdAt: challenge.properties.createdAt,
  });
  return { challenge, otpEvidence: [evidence] };
}

describe('VerificationApplicationService', () => {
  const identityRepository: jest.Mocked<IdentityRepository> = {
    findById: jest.fn(),
    findPasswordHistory: jest.fn(),
    findAuthenticationById: jest.fn(),
    findByIdentifierLookups: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
    advanceTotpReplayState: jest.fn(),
  };

  const verificationChallenges: jest.Mocked<VerificationChallengeRepository> = {
    findById: jest.fn(),
    findAggregateById: jest.fn(),
    findActiveByBinding: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
    completeTotpChallenge: jest.fn(),
    rejectTotpChallenge: jest.fn(),
    confirmOtpChallenge: jest.fn(),
    rejectOtpChallenge: jest.fn(),
    expireActiveChallengesForIdentity: jest.fn(),
    completeMfaEnrollmentChallenge: jest.fn(),
  };

  const otpCrypto: jest.Mocked<OtpRecoveryCodeCryptographicPort> = {
    issueOtp: jest.fn().mockReturnValue({
      rawValue: '123456',
      digest: 'otp-digest',
      keyVersion: 'v1',
    }),
    matchesOtp: jest.fn(),
    issueRecoveryCodeSet: jest.fn(),
    matchesRecoveryCode: jest.fn(),
  };

  const otpDelivery: jest.Mocked<OtpDeliveryPort> = {
    deliver: jest.fn().mockResolvedValue(undefined),
  };

  const identifierLookup: jest.Mocked<IdentifierLookupCryptographicPort> = {
    createActiveLookup: jest.fn(),
    createLookupsForResolution: jest.fn().mockReturnValue(['destination-lookup']),
  };

  const clock = { now: () => FIXED_NOW };
  const identifiers = { next: nextUuid };

  let service: VerificationApplicationService;

  beforeEach(() => {
    jest.clearAllMocks();
    UUID_QUEUE.length = 0;
    UUID_QUEUE.push(...BASE_UUID_QUEUE);
    otpDelivery.deliver.mockResolvedValue(undefined);
    identifierLookup.createLookupsForResolution.mockReturnValue(['destination-lookup']);
    service = new VerificationApplicationService(
      identityRepository,
      verificationChallenges,
      otpCrypto,
      otpDelivery,
      identifierLookup,
      clock,
      identifiers,
      {
        environment: 'test',
        otpLifetimeSeconds: 300,
        maximumVerificationAttempts: 5,
      },
    );
  });

  describe('M01-VER-001 requestChallenge', () => {
    it('issues a purpose-bound challenge for the new destination and delivers the OTP', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      identityRepository.findByIdentifierLookups.mockResolvedValue(null);
      verificationChallenges.findActiveByBinding.mockResolvedValue(null);

      const result = await service.requestChallenge({
        identityId: new UuidV7(IDENTITY_ID),
        purpose: 'CONTACT_CHANGE_VERIFICATION',
        channelType: 'EMAIL',
        destination: DESTINATION,
      });

      expect(result).toEqual({
        challengeId: CHALLENGE_ID,
        state: 'CHALLENGE_ISSUED',
        expiresAt: new Date(FIXED_NOW.getTime() + 300_000),
        version: 1,
      });
      expect(verificationChallenges.insert.mock.calls).toHaveLength(1);
      const inserted = verificationChallenges.insert.mock.calls[0]?.[0];
      expect(inserted?.challenge.properties.purpose).toBe('CONTACT_CHANGE_VERIFICATION');
      expect(inserted?.challenge.properties.challengeState).toBe('CHALLENGE_ISSUED');
      expect(inserted?.challenge.properties.identityId?.value).toBe(IDENTITY_ID);
      expect(inserted?.challenge.properties.protectedDestinationReference.value).toBe(DESTINATION);
      expect(inserted?.otpEvidence).toHaveLength(1);
      expect(otpDelivery.deliver.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          destination: DESTINATION,
          channel: 'EMAIL',
          rawOtp: '123456',
          purpose: 'CONTACT_CHANGE_VERIFICATION',
        }),
      );
    });

    it('rejects a request for a non-active identity', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(
        buildSnapshot('PENDING_VERIFICATION'),
      );

      await expect(
        service.requestChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: DESTINATION,
        }),
      ).rejects.toThrow(new VerificationError('VERIFICATION_NOT_PERMITTED'));
    });

    it('rejects a request when the identity does not exist', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(null);

      await expect(
        service.requestChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: DESTINATION,
        }),
      ).rejects.toThrow(new VerificationError('VERIFICATION_NOT_PERMITTED'));
    });

    it('rejects a purpose outside the approved allowlist', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());

      await expect(
        service.requestChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          purpose: 'MFA_AUTHENTICATION',
          channelType: 'EMAIL',
          destination: DESTINATION,
        }),
      ).rejects.toThrow(new VerificationError('VERIFICATION_NOT_PERMITTED'));
      expect(verificationChallenges.insert.mock.calls).toHaveLength(0);
    });

    it('rejects a destination that does not match the channel', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());

      await expect(
        service.requestChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: 'not-an-email',
        }),
      ).rejects.toThrow(new VerificationError('VERIFICATION_NOT_PERMITTED'));
      expect(verificationChallenges.insert.mock.calls).toHaveLength(0);
    });

    it('rejects a destination already owned by the caller', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      identityRepository.findByIdentifierLookups.mockResolvedValue(
        buildSnapshot('ACTIVE', IDENTITY_ID),
      );

      await expect(
        service.requestChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: DESTINATION,
        }),
      ).rejects.toThrow(new VerificationError('VERIFICATION_NOT_PERMITTED'));
      expect(verificationChallenges.insert.mock.calls).toHaveLength(0);
      expect(otpDelivery.deliver.mock.calls).toHaveLength(0);
    });

    it('conceals when the destination belongs to another identity', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      identityRepository.findByIdentifierLookups.mockResolvedValue(
        buildSnapshot('ACTIVE', OTHER_IDENTITY_ID),
      );
      UUID_QUEUE.length = 0;

      const result = await service.requestChallenge({
        identityId: new UuidV7(IDENTITY_ID),
        purpose: 'CONTACT_CHANGE_VERIFICATION',
        channelType: 'EMAIL',
        destination: DESTINATION,
      });

      expect(result.challengeId).toBe(CONCEALED_ID);
      expect(result.state).toBe('CHALLENGE_ISSUED');
      expect(verificationChallenges.insert.mock.calls).toHaveLength(0);
      expect(otpDelivery.deliver.mock.calls).toHaveLength(0);
      expect(otpCrypto.issueOtp.mock.calls).toHaveLength(0);
    });

    it('rejects a second challenge while one is still active', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      identityRepository.findByIdentifierLookups.mockResolvedValue(null);
      verificationChallenges.findActiveByBinding.mockResolvedValue(
        buildChallengeAggregate().challenge,
      );

      await expect(
        service.requestChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: DESTINATION,
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_ALREADY_ACTIVE'));
    });

    it('cancels the orphaned challenge when OTP delivery fails', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      identityRepository.findByIdentifierLookups.mockResolvedValue(null);
      verificationChallenges.findActiveByBinding.mockResolvedValue(null);
      otpDelivery.deliver.mockRejectedValue(new Error('provider unavailable'));

      await expect(
        service.requestChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          purpose: 'CONTACT_CHANGE_VERIFICATION',
          channelType: 'EMAIL',
          destination: DESTINATION,
        }),
      ).rejects.toThrow('provider unavailable');

      expect(verificationChallenges.save.mock.calls).toHaveLength(1);
      const cancelled = verificationChallenges.save.mock.calls[0]?.[0];
      expect(cancelled?.challenge.properties.challengeState).toBe('CANCELLED');
      expect(cancelled?.challenge.properties.cancelledAt).toEqual(FIXED_NOW);
    });
  });

  describe('M01-VER-002 confirmChallenge', () => {
    beforeEach(() => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
    });

    it('confirms the challenge with a valid OTP', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      otpCrypto.matchesOtp.mockReturnValue(true);
      verificationChallenges.confirmOtpChallenge.mockResolvedValue(true);

      const result = await service.confirmChallenge({
        identityId: new UuidV7(IDENTITY_ID),
        challengeId: new UuidV7(CHALLENGE_ID),
        expectedChallengeVersion: 1,
        verificationEvidence: '123456',
      });

      expect(result).toEqual({
        challengeId: CHALLENGE_ID,
        verificationState: 'VERIFIED',
        verifiedAt: FIXED_NOW,
        version: 2,
      });
      const command = verificationChallenges.confirmOtpChallenge.mock.calls[0]?.[0];
      expect(command?.updatedChallenge.properties.challengeState).toBe('VERIFIED');
      expect(command?.consumedEvidence?.properties.evidenceState).toBe('CONSUMED');
      expect(command?.attempt.properties.outcome).toBe('SUCCEEDED');
      expect(otpCrypto.matchesOtp.mock.calls[0]?.[0]).toBe('123456');
    });

    it('rejects an invalid OTP and records a non-terminal attempt', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      otpCrypto.matchesOtp.mockReturnValue(false);
      verificationChallenges.rejectOtpChallenge.mockResolvedValue(true);

      await expect(
        service.confirmChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '000000',
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));

      const command = verificationChallenges.rejectOtpChallenge.mock.calls[0]?.[0];
      expect(command?.updatedChallenge.properties.challengeState).toBe('CHALLENGE_ISSUED');
      expect(command?.attempt.properties.outcome).toBe('REJECTED');
    });

    it('fails the challenge terminally on the final attempt', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(
        buildChallengeAggregate({ attemptCount: 4 }),
      );
      otpCrypto.matchesOtp.mockReturnValue(false);
      verificationChallenges.rejectOtpChallenge.mockResolvedValue(true);

      await expect(
        service.confirmChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '000000',
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));

      const command = verificationChallenges.rejectOtpChallenge.mock.calls[0]?.[0];
      expect(command?.updatedChallenge.properties.challengeState).toBe('FAILED');
      expect(command?.attempt.properties.outcome).toBe('FAILED_SECURELY');
    });

    it('rejects an expired challenge without invoking cryptography', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(
        buildChallengeAggregate({
          expiresAt: new Date(FIXED_NOW.getTime() - 1),
          createdAt: new Date(FIXED_NOW.getTime() - 300_000),
        }),
      );

      await expect(
        service.confirmChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
      expect(otpCrypto.matchesOtp.mock.calls).toHaveLength(0);
    });

    it('rejects a challenge bound to another identity', async () => {
      const aggregate = buildChallengeAggregate();
      const unrelated = new VerificationChallenge({
        ...aggregate.challenge.properties,
        identityId: new UuidV7(OTHER_IDENTITY_ID),
      });
      verificationChallenges.findAggregateById.mockResolvedValue({
        challenge: unrelated,
        otpEvidence: aggregate.otpEvidence,
      });

      await expect(
        service.confirmChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
    });

    it('rejects a challenge for an unapproved purpose', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(
        buildChallengeAggregate({ purpose: 'PASSWORD_RECOVERY' }),
      );

      await expect(
        service.confirmChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
    });

    it('rejects a challenge for an identity that is no longer active', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot('DISABLED'));

      await expect(
        service.confirmChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
      expect(verificationChallenges.findAggregateById.mock.calls).toHaveLength(0);
    });

    it('rejects a stale If-Match version with a state conflict', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(
        buildChallengeAggregate({ aggregateVersion: new AggregateVersion(3) }),
      );

      await expect(
        service.confirmChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      ).rejects.toThrow(new VerificationError('RESOURCE_STATE_CONFLICT'));
    });

    it('treats a concurrent confirmation as an invalid challenge', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      otpCrypto.matchesOtp.mockReturnValue(true);
      verificationChallenges.confirmOtpChallenge.mockResolvedValue(false);

      await expect(
        service.confirmChallenge({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
    });
  });

  describe('M01-VER-003 commitContactChange', () => {
    const CONSUMED_AT = new Date(FIXED_NOW.getTime() - 60_000);

    function buildVerifiedChallengeAggregate(): VerificationChallengeAggregate {
      return buildChallengeAggregate({
        challengeState: 'VERIFIED',
        consumedAt: CONSUMED_AT,
        attemptCount: 1,
        aggregateVersion: new AggregateVersion(2),
      });
    }

    beforeEach(() => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
    });

    it('attaches the verified identifier as primary and retires the previous primary', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildVerifiedChallengeAggregate());
      identityRepository.findByIdentifierLookups.mockResolvedValue(null);
      identityRepository.save.mockResolvedValue(undefined);

      const result = await service.commitContactChange({
        identityId: new UuidV7(IDENTITY_ID),
        challengeId: new UuidV7(CHALLENGE_ID),
        expectedChallengeVersion: 2,
      });

      expect(result).toEqual({
        challengeId: CHALLENGE_ID,
        contactChange: 'COMMITTED',
        committedAt: FIXED_NOW,
        version: 3,
        primaryIdentifier: { identifierType: 'EMAIL', verificationState: 'VERIFIED' },
      });

      // The VERIFIED challenge is consumed: version advanced and a SUCCEEDED
      // commit attempt appended before the identifier change committed.
      const consumed = verificationChallenges.save.mock.calls[0]?.[0];
      expect(consumed?.challenge.properties.aggregateVersion.value).toBe(3);
      expect(consumed?.attemptsToAppend[0]?.properties.outcome).toBe('SUCCEEDED');
      expect(consumed?.attemptsToAppend[0]?.properties.failureReason).toBe(
        'CONTACT_CHANGE_COMMITTED',
      );

      // The identifier change committed atomically in one version-guarded save.
      const changeSet = identityRepository.save.mock.calls[0]?.[0];
      expect(changeSet?.identity.properties.aggregateVersion.value).toBe(3);
      expect(changeSet?.identifiers).toHaveLength(2);
      const attached = changeSet?.identifiers.find((identifier) => identifier.properties.isPrimary);
      expect(attached?.properties.verificationState).toBe('VERIFIED');
      expect(attached?.properties.protectedNormalizedValue.value).toBe(DESTINATION);
      expect(attached?.properties.verifiedAt).toEqual(CONSUMED_AT);
      const retired = changeSet?.identifiers.find((identifier) => !identifier.properties.isPrimary);
      expect(retired?.properties.verificationState).toBe('RETIRED');
      expect(retired?.properties.retiredAt).toEqual(FIXED_NOW);
      expect(identityRepository.save.mock.calls[0]?.[1]?.value).toBe(2);
    });

    it('rejects a commit for a non-active identity', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot('DISABLED'));

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('VERIFICATION_NOT_PERMITTED'));
      expect(verificationChallenges.findAggregateById.mock.calls).toHaveLength(0);
    });

    it('rejects an unknown challenge', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(null);

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
    });

    it('rejects a challenge that was never verified', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
    });

    it('rejects an expired verified challenge', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(
        buildChallengeAggregate({
          challengeState: 'VERIFIED',
          consumedAt: CONSUMED_AT,
          attemptCount: 1,
          aggregateVersion: new AggregateVersion(2),
          expiresAt: new Date(FIXED_NOW.getTime() - 1),
          createdAt: new Date(FIXED_NOW.getTime() - 300_000),
        }),
      );

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
      expect(verificationChallenges.save.mock.calls).toHaveLength(0);
    });

    it('rejects a challenge bound to another identity', async () => {
      const aggregate = buildVerifiedChallengeAggregate();
      const unrelated = new VerificationChallenge({
        ...aggregate.challenge.properties,
        identityId: new UuidV7(OTHER_IDENTITY_ID),
      });
      verificationChallenges.findAggregateById.mockResolvedValue({
        challenge: unrelated,
        otpEvidence: aggregate.otpEvidence,
      });

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
    });

    it('rejects a challenge for an unapproved purpose', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(
        buildChallengeAggregate({
          purpose: 'PASSWORD_RECOVERY',
          challengeState: 'VERIFIED',
          consumedAt: CONSUMED_AT,
          attemptCount: 1,
          aggregateVersion: new AggregateVersion(2),
        }),
      );

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('CHALLENGE_INVALID_OR_EXPIRED'));
    });

    it('rejects a stale If-Match version with a state conflict', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildVerifiedChallengeAggregate());

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
        }),
      ).rejects.toThrow(new VerificationError('RESOURCE_STATE_CONFLICT'));
      expect(verificationChallenges.save.mock.calls).toHaveLength(0);
    });

    it('rejects when the destination now belongs to another identity', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildVerifiedChallengeAggregate());
      identityRepository.findByIdentifierLookups.mockResolvedValue(
        buildSnapshot('ACTIVE', OTHER_IDENTITY_ID),
      );

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('VERIFICATION_NOT_PERMITTED'));
      expect(verificationChallenges.save.mock.calls).toHaveLength(0);
      expect(identityRepository.save.mock.calls).toHaveLength(0);
    });

    it('rejects a replay when the destination is already owned by the caller', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildVerifiedChallengeAggregate());
      identityRepository.findByIdentifierLookups.mockResolvedValue(
        buildSnapshot('ACTIVE', IDENTITY_ID),
      );

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('VERIFICATION_NOT_PERMITTED'));
      expect(verificationChallenges.save.mock.calls).toHaveLength(0);
      expect(identityRepository.save.mock.calls).toHaveLength(0);
    });

    it('rejects when the identity has no primary identifier to retire', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildVerifiedChallengeAggregate());
      identityRepository.findByIdentifierLookups.mockResolvedValue(null);
      identityRepository.findAuthenticationById.mockResolvedValue({
        ...buildSnapshot(),
        identifiers: [],
      });

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('VERIFICATION_NOT_PERMITTED'));
      expect(identityRepository.save.mock.calls).toHaveLength(0);
    });

    it('maps a concurrent destination claim to a state conflict', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildVerifiedChallengeAggregate());
      identityRepository.findByIdentifierLookups.mockResolvedValue(null);
      identityRepository.save.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('RESOURCE_STATE_CONFLICT'));
    });

    it('maps a concurrent challenge consumption to a state conflict', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildVerifiedChallengeAggregate());
      identityRepository.findByIdentifierLookups.mockResolvedValue(null);
      verificationChallenges.save.mockRejectedValue(
        new OptimisticConcurrencyError('VerificationChallenge'),
      );

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('RESOURCE_STATE_CONFLICT'));
      expect(identityRepository.save.mock.calls).toHaveLength(0);
    });

    it('maps a concurrent identity update to a state conflict', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildVerifiedChallengeAggregate());
      identityRepository.findByIdentifierLookups.mockResolvedValue(null);
      identityRepository.save.mockRejectedValue(new OptimisticConcurrencyError('Identity'));

      await expect(
        service.commitContactChange({
          identityId: new UuidV7(IDENTITY_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 2,
        }),
      ).rejects.toThrow(new VerificationError('RESOURCE_STATE_CONFLICT'));
    });
  });
});
