import { Identity } from '../../domain/identity/entities/identity';
import { IdentityIdentifier } from '../../domain/identity/entities/identity-identifier';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { IdentityState } from '../../domain/identity/value-objects/identity-state';
import type { IdentifierVerificationState } from '../../domain/identity/value-objects/verification-state';
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
import { IdentityError } from '../errors/identity.error';
import { RegistrationError } from '../errors/registration.error';
import type { OtpDeliveryPort } from '../ports/otp-delivery.port';
import type { OtpRecoveryCodeCryptographicPort } from '../ports/otp-recovery-code-cryptographic.port';
import type { IdentityManagementApplicationService } from './identity-management-application.service';
import { RegistrationApplicationService } from './registration-application.service';

const REGISTRATION_ID = '0191310f-789a-7123-8123-000000000001';
const IDENTIFIER_ID = '0191310f-789a-7123-8123-000000000002';
const CHALLENGE_ID = '0191310f-789a-7123-8123-000000000003';
const EVIDENCE_ID = '0191310f-789a-7123-8123-000000000004';
const ATTEMPT_ID = '0191310f-789a-7123-8123-000000000005';
const TRANSITION_ID = '0191310f-789a-7123-8123-000000000006';
const CONCEALED_ID = '0191310f-789a-7123-8123-000000000099';
const FIXED_NOW = new Date('2026-08-07T12:00:00.000Z');

// Ordered to match the service's identifier consumption: challenge issuance
// consumes challengeId then evidenceId, confirmation consumes attemptId, and
// activation consumes transitionId.
const BASE_UUID_QUEUE = [
  CHALLENGE_ID,
  EVIDENCE_ID,
  ATTEMPT_ID,
  TRANSITION_ID,
  REGISTRATION_ID,
  IDENTIFIER_ID,
];
const UUID_QUEUE: string[] = [];

function nextUuid(): UuidV7 {
  const value = UUID_QUEUE.shift() ?? CONCEALED_ID;
  return new UuidV7(value);
}

function buildSnapshot(
  identityState: IdentityState = 'PENDING_VERIFICATION',
  verificationState: IdentifierVerificationState = 'UNVERIFIED',
  aggregateVersion = 1,
): IdentityAuthenticationSnapshot {
  return {
    identity: new Identity({
      identityId: new UuidV7(REGISTRATION_ID),
      identityState,
      verificationState: 'PENDING_VERIFICATION',
      aggregateVersion: new AggregateVersion(aggregateVersion),
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    }),
    identifiers: [
      new IdentityIdentifier({
        identifierId: new UuidV7(IDENTIFIER_ID),
        identityId: new UuidV7(REGISTRATION_ID),
        identifierType: 'EMAIL',
        protectedNormalizedValue: new ProtectedValue('user@example.com'),
        lookupDigest: new ProtectedValue('lookup-digest'),
        lookupKeyVersion: 'v1',
        verificationState,
        isPrimary: true,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        ...(verificationState === 'VERIFIED' ? { verifiedAt: FIXED_NOW } : {}),
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
    identityId: new UuidV7(REGISTRATION_ID),
    purpose: 'REGISTRATION_VERIFICATION',
    channelType: 'EMAIL',
    protectedDestinationReference: new ProtectedValue('user@example.com'),
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

describe('RegistrationApplicationService', () => {
  const identityManagement = {
    register: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    deactivate: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as jest.Mocked<IdentityManagementApplicationService>;

  const identityRepository: jest.Mocked<IdentityRepository> = {
    findById: jest.fn(),
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

  const clock = { now: () => FIXED_NOW };
  const identifiers = { next: nextUuid };

  let service: RegistrationApplicationService;

  beforeEach(() => {
    jest.clearAllMocks();
    UUID_QUEUE.length = 0;
    UUID_QUEUE.push(...BASE_UUID_QUEUE);
    otpDelivery.deliver.mockResolvedValue(undefined);
    service = new RegistrationApplicationService(
      identityManagement,
      identityRepository,
      verificationChallenges,
      otpCrypto,
      otpDelivery,
      clock,
      identifiers,
      {
        environment: 'test',
        otpLifetimeSeconds: 300,
        maximumVerificationAttempts: 5,
      },
    );
  });

  describe('M01-REG-001 register', () => {
    it('delegates to identity registration and returns a pending registration', async () => {
      identityManagement.register.mockResolvedValue({
        identityId: REGISTRATION_ID,
        identityState: 'PENDING_VERIFICATION',
        verificationState: 'PENDING_VERIFICATION',
        aggregateVersion: 1,
        classification: 'STANDARD_AUTHENTICATION',
        primaryIdentifier: { identifierType: 'EMAIL', verificationState: 'UNVERIFIED' },
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });

      const result = await service.register({
        identifierType: 'EMAIL',
        identifier: 'user@example.com',
        password: 'SecurePassword123!',
      });

      expect(result).toEqual({
        registrationId: REGISTRATION_ID,
        status: 'PENDING_VERIFICATION',
        version: 1,
      });
      expect(identityManagement.register.mock.calls).toHaveLength(1);
    });

    it('conceals identifier existence when the identifier is already registered', async () => {
      identityManagement.register.mockRejectedValue(new IdentityError('IDENTIFIER_ALREADY_REGISTERED'));
      UUID_QUEUE.length = 0;

      const result = await service.register({
        identifierType: 'EMAIL',
        identifier: 'existing@example.com',
        password: 'SecurePassword123!',
      });

      expect(result.status).toBe('PENDING_VERIFICATION');
      expect(result.registrationId).toBe(CONCEALED_ID);
    });
  });

  describe('M01-REG-002 requestVerificationChallenge', () => {
    it('issues a purpose-bound OTP challenge and delivers the OTP', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      verificationChallenges.findActiveByBinding.mockResolvedValue(null);

      const result = await service.requestVerificationChallenge({
        registrationId: new UuidV7(REGISTRATION_ID),
        expectedVersion: 1,
        channelType: 'EMAIL',
      });

      expect(result.challengeId).toBe(CHALLENGE_ID);
      expect(result.version).toBe(1);
      expect(result.expiresAt).toEqual(new Date(FIXED_NOW.getTime() + 300_000));
      expect(verificationChallenges.insert.mock.calls).toHaveLength(1);
      const inserted = verificationChallenges.insert.mock.calls[0]?.[0];
      expect(inserted?.challenge.properties.purpose).toBe('REGISTRATION_VERIFICATION');
      expect(inserted?.challenge.properties.challengeState).toBe('CHALLENGE_ISSUED');
      expect(inserted?.otpEvidence).toHaveLength(1);
      expect(otpDelivery.deliver.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ rawOtp: '123456', channel: 'EMAIL' }),
      );
    });

    it('rejects a challenge for a registration that is not pending verification', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot('ACTIVE'));

      await expect(
        service.requestVerificationChallenge({
          registrationId: new UuidV7(REGISTRATION_ID),
          expectedVersion: 1,
          channelType: 'EMAIL',
        }),
      ).rejects.toThrow(new RegistrationError('REGISTRATION_STATE_CONFLICT'));
    });

    it('rejects when the If-Match version does not match', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot('PENDING_VERIFICATION', 'UNVERIFIED', 3));

      await expect(
        service.requestVerificationChallenge({
          registrationId: new UuidV7(REGISTRATION_ID),
          expectedVersion: 1,
          channelType: 'EMAIL',
        }),
      ).rejects.toThrow(new RegistrationError('REGISTRATION_STATE_CONFLICT'));
    });

    it('rejects when the identifier is already verified', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(
        buildSnapshot('PENDING_VERIFICATION', 'VERIFIED'),
      );

      await expect(
        service.requestVerificationChallenge({
          registrationId: new UuidV7(REGISTRATION_ID),
          expectedVersion: 1,
          channelType: 'EMAIL',
        }),
      ).rejects.toThrow(new RegistrationError('REGISTRATION_STATE_CONFLICT'));
    });

    it('rejects a channel that does not match the primary identifier', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());

      await expect(
        service.requestVerificationChallenge({
          registrationId: new UuidV7(REGISTRATION_ID),
          expectedVersion: 1,
          channelType: 'SMS',
        }),
      ).rejects.toThrow(new RegistrationError('VERIFICATION_NOT_PERMITTED'));
    });

    it('rejects a second challenge while one is still active', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      verificationChallenges.findActiveByBinding.mockResolvedValue(
        buildChallengeAggregate().challenge,
      );

      await expect(
        service.requestVerificationChallenge({
          registrationId: new UuidV7(REGISTRATION_ID),
          expectedVersion: 1,
          channelType: 'EMAIL',
        }),
      ).rejects.toThrow(new RegistrationError('CHALLENGE_ALREADY_ACTIVE'));
    });

    it('throws when the registration does not exist', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(null);

      await expect(
        service.requestVerificationChallenge({
          registrationId: new UuidV7(REGISTRATION_ID),
          expectedVersion: 1,
          channelType: 'EMAIL',
        }),
      ).rejects.toThrow(new RegistrationError('REGISTRATION_NOT_FOUND'));
    });

    it('cancels the orphaned challenge when OTP delivery fails', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      verificationChallenges.findActiveByBinding.mockResolvedValue(null);
      otpDelivery.deliver.mockRejectedValue(new Error('provider unavailable'));

      await expect(
        service.requestVerificationChallenge({
          registrationId: new UuidV7(REGISTRATION_ID),
          expectedVersion: 1,
          channelType: 'EMAIL',
        }),
      ).rejects.toThrow('provider unavailable');

      expect(verificationChallenges.save.mock.calls).toHaveLength(1);
      const cancelled = verificationChallenges.save.mock.calls[0]?.[0];
      expect(cancelled?.challenge.properties.challengeState).toBe('CANCELLED');
      expect(cancelled?.challenge.properties.cancelledAt).toEqual(FIXED_NOW);
    });
  });

  describe('M01-REG-003 confirmVerification', () => {
    it('consumes the challenge and marks the primary identifier verified', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      otpCrypto.matchesOtp.mockReturnValue(true);
      verificationChallenges.confirmOtpChallenge.mockResolvedValue(true);
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());
      identityRepository.save.mockResolvedValue(undefined);

      const result = await service.confirmVerification({
        registrationId: new UuidV7(REGISTRATION_ID),
        challengeId: new UuidV7(CHALLENGE_ID),
        expectedChallengeVersion: 1,
        verificationEvidence: '123456',
      });

      expect(result.status).toBe('VERIFIED');
      expect(verificationChallenges.confirmOtpChallenge.mock.calls).toHaveLength(1);
      const command = verificationChallenges.confirmOtpChallenge.mock.calls[0]?.[0];
      expect(command?.updatedChallenge.properties.challengeState).toBe('VERIFIED');
      expect(command?.consumedEvidence?.properties.evidenceState).toBe('CONSUMED');
      expect(command?.attempt.properties.outcome).toBe('SUCCEEDED');
      expect(identityRepository.save.mock.calls).toHaveLength(1);
      const changeSet = identityRepository.save.mock.calls[0]?.[0];
      expect(changeSet?.identifiers[0]?.properties.verificationState).toBe('VERIFIED');
    });

    it('rejects an invalid OTP and records a non-terminal attempt', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      otpCrypto.matchesOtp.mockReturnValue(false);
      verificationChallenges.rejectOtpChallenge.mockResolvedValue(true);

      await expect(
        service.confirmVerification({
          registrationId: new UuidV7(REGISTRATION_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '000000',
        }),
      ).rejects.toThrow(new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED'));

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
        service.confirmVerification({
          registrationId: new UuidV7(REGISTRATION_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '000000',
        }),
      ).rejects.toThrow(new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED'));

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
        service.confirmVerification({
          registrationId: new UuidV7(REGISTRATION_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      ).rejects.toThrow(new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED'));
      expect(otpCrypto.matchesOtp.mock.calls).toHaveLength(0);
    });

    it('rejects a challenge bound to another registration', async () => {
      const aggregate = buildChallengeAggregate();
      const unrelated = new VerificationChallenge({
        ...aggregate.challenge.properties,
        identityId: new UuidV7('0191310f-789a-7123-8123-000000000088'),
      });
      verificationChallenges.findAggregateById.mockResolvedValue({
        challenge: unrelated,
        otpEvidence: aggregate.otpEvidence,
      });

      await expect(
        service.confirmVerification({
          registrationId: new UuidV7(REGISTRATION_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      ).rejects.toThrow(new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED'));
    });

    it('treats a concurrent confirmation as an invalid challenge', async () => {
      verificationChallenges.findAggregateById.mockResolvedValue(buildChallengeAggregate());
      otpCrypto.matchesOtp.mockReturnValue(true);
      verificationChallenges.confirmOtpChallenge.mockResolvedValue(false);

      await expect(
        service.confirmVerification({
          registrationId: new UuidV7(REGISTRATION_ID),
          challengeId: new UuidV7(CHALLENGE_ID),
          expectedChallengeVersion: 1,
          verificationEvidence: '123456',
        }),
      ).rejects.toThrow(new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED'));
    });
  });

  describe('M01-REG-004 activate', () => {
    it('activates a verified registration and records the transition', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(
        buildSnapshot('PENDING_VERIFICATION', 'VERIFIED'),
      );
      identityRepository.save.mockResolvedValue(undefined);

      const result = await service.activate({
        registrationId: new UuidV7(REGISTRATION_ID),
        expectedVersion: 1,
      });

      expect(result.status).toBe('ACTIVE');
      expect(result.identityState).toBe('ACTIVE');
      expect(identityRepository.save.mock.calls).toHaveLength(1);
      const changeSet = identityRepository.save.mock.calls[0]?.[0];
      expect(changeSet?.identity.properties.identityState).toBe('ACTIVE');
      expect(changeSet?.identity.properties.verificationState).toBe('VERIFIED');
      expect(changeSet?.stateTransitionsToAppend).toHaveLength(1);
      expect(changeSet?.stateTransitionsToAppend[0]?.properties.toState).toBe('ACTIVE');
      expect(identityRepository.save.mock.calls[0]?.[1].value).toBe(1);
    });

    it('rejects activation before verification completes', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());

      await expect(
        service.activate({
          registrationId: new UuidV7(REGISTRATION_ID),
          expectedVersion: 1,
        }),
      ).rejects.toThrow(new RegistrationError('REGISTRATION_NOT_READY'));
    });

    it('rejects activation of a non-pending registration', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(
        buildSnapshot('ACTIVE', 'VERIFIED'),
      );

      await expect(
        service.activate({
          registrationId: new UuidV7(REGISTRATION_ID),
          expectedVersion: 1,
        }),
      ).rejects.toThrow(new RegistrationError('REGISTRATION_STATE_CONFLICT'));
    });
  });

  describe('M01-REG-005 getStatus', () => {
    it('reports PENDING_VERIFICATION before verification', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(buildSnapshot());

      const result = await service.getStatus(new UuidV7(REGISTRATION_ID));

      expect(result).toEqual({ registrationId: REGISTRATION_ID, status: 'PENDING_VERIFICATION', version: 1 });
    });

    it('reports VERIFIED once the identifier is verified', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(
        buildSnapshot('PENDING_VERIFICATION', 'VERIFIED'),
      );

      const result = await service.getStatus(new UuidV7(REGISTRATION_ID));

      expect(result.status).toBe('VERIFIED');
    });

    it('reports ACTIVE once activated', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(
        buildSnapshot('ACTIVE', 'VERIFIED', 2),
      );

      const result = await service.getStatus(new UuidV7(REGISTRATION_ID));

      expect(result.status).toBe('ACTIVE');
      expect(result.version).toBe(2);
    });

    it('throws when the registration does not exist', async () => {
      identityRepository.findAuthenticationById.mockResolvedValue(null);

      await expect(service.getStatus(new UuidV7(REGISTRATION_ID))).rejects.toThrow(
        new RegistrationError('REGISTRATION_NOT_FOUND'),
      );
    });
  });
});
