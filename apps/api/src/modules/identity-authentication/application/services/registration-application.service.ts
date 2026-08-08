import { Identity } from '../../domain/identity/entities/identity';
import { IdentityIdentifier } from '../../domain/identity/entities/identity-identifier';
import { IdentityStateTransition } from '../../domain/identity/entities/identity-state-transition';
import type {
  IdentityAggregateChangeSet,
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { AuthenticationSecurityClassification } from '../../domain/identity/value-objects/authentication-security-classification';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { OtpEvidenceRecord } from '../../domain/verification/entities/otp-evidence-record';
import { VerificationAttempt } from '../../domain/verification/entities/verification-attempt';
import { VerificationChallenge } from '../../domain/verification/entities/verification-challenge';
import type { VerificationChallengeRepository } from '../../domain/verification/repositories/verification-challenge-repository';
import type { VerificationChannel } from '../../domain/verification/value-objects/verification-channel';
import { IdentityError } from '../errors/identity.error';
import { RegistrationError } from '../errors/registration.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { OtpDeliveryPort } from '../ports/otp-delivery.port';
import type { OtpRecoveryCodeCryptographicPort } from '../ports/otp-recovery-code-cryptographic.port';
import type { IdentityManagementApplicationService } from './identity-management-application.service';

export type RegistrationStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'ACTIVE';

export interface RegistrationApplicationOptions {
  readonly environment: string;
  readonly otpLifetimeSeconds: number;
  readonly maximumVerificationAttempts: number;
}

export interface RegisterRegistrationCommand {
  readonly identifierType: IdentifierType;
  readonly identifier: string;
  readonly password: string;
  readonly classification?: AuthenticationSecurityClassification;
}

export interface RegistrationResult {
  readonly registrationId: string;
  readonly status: RegistrationStatus;
  readonly version: number;
}

export interface RequestVerificationChallengeCommand {
  readonly registrationId: UuidV7;
  readonly expectedVersion: number;
  readonly channelType: VerificationChannel;
}

export interface VerificationChallengeResult {
  readonly challengeId: string;
  readonly version: number;
  readonly expiresAt: Date;
}

export interface ConfirmVerificationCommand {
  readonly registrationId: UuidV7;
  readonly challengeId: UuidV7;
  readonly expectedChallengeVersion: number;
  readonly verificationEvidence: string;
}

export interface VerificationConfirmationResult {
  readonly status: 'VERIFIED';
  readonly registrationId: string;
  readonly version: number;
}

export interface ActivateRegistrationCommand {
  readonly registrationId: UuidV7;
  readonly expectedVersion: number;
}

export interface ActivationResult {
  readonly status: 'ACTIVE';
  readonly identityState: 'ACTIVE';
  readonly verificationState: 'VERIFIED';
  readonly version: number;
}

export interface RegistrationStatusResult {
  readonly registrationId: string;
  readonly status: RegistrationStatus;
  readonly version: number;
}

/**
 * M01-REG-001 through M01-REG-005 registration lifecycle.
 *
 * A pending registration IS the identity aggregate created in
 * PENDING_VERIFICATION (Module 01 registration "creates an identity only");
 * the registrationId is therefore the identity id. Verification must complete
 * before activation ("verification before activation"): only after the primary
 * identifier is VERIFIED may the identity transition to ACTIVE, which is what
 * permits authentication (the login flow rejects every non-ACTIVE identity).
 */
export class RegistrationApplicationService {
  public constructor(
    private readonly identityManagement: IdentityManagementApplicationService,
    private readonly identityRepository: IdentityRepository,
    private readonly verificationChallenges: VerificationChallengeRepository,
    private readonly otpCrypto: OtpRecoveryCodeCryptographicPort,
    private readonly otpDelivery: OtpDeliveryPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly options: RegistrationApplicationOptions,
  ) {}

  /**
   * M01-REG-001. Enumeration-safe by contract: when the identifier is already
   * registered, an indistinguishable pending registration reference is returned
   * so the response never reveals identifier existence.
   */
  public async register(command: RegisterRegistrationCommand): Promise<RegistrationResult> {
    try {
      const profile = await this.identityManagement.register(command);
      return {
        registrationId: profile.identityId,
        status: 'PENDING_VERIFICATION',
        version: profile.aggregateVersion,
      };
    } catch (error) {
      if (error instanceof IdentityError && error.code === 'IDENTIFIER_ALREADY_REGISTERED') {
        return {
          registrationId: this.identifiers.next().value,
          status: 'PENDING_VERIFICATION',
          version: 1,
        };
      }
      if (error instanceof IdentityError && error.code === 'IDENTIFIER_INVALID') {
        // A malformed identifier must surface as a clean rejection, never as an
        // unhandled 500 that could distinguish identifier formats.
        throw new RegistrationError('VERIFICATION_NOT_PERMITTED');
      }
      if (error instanceof IdentityError && error.code === 'CLASSIFICATION_NOT_PERMITTED') {
        // Self-service registration may never assert an elevated classification;
        // map the service-level guard to the same clean rejection used above.
        throw new RegistrationError('VERIFICATION_NOT_PERMITTED');
      }
      throw error;
    }
  }

  /**
   * M01-REG-002. Issues a purpose-bound, identity-bound, channel-bound OTP
   * challenge for the pending registration's primary identifier. Only one
   * active challenge may exist per (identity, purpose, channel); resend policy
   * is additionally enforced by the OTP_REQUEST rate class.
   */
  public async requestVerificationChallenge(
    command: RequestVerificationChallengeCommand,
  ): Promise<VerificationChallengeResult> {
    const snapshot = await this.identityRepository.findAuthenticationById(command.registrationId);
    if (snapshot === null) throw new RegistrationError('REGISTRATION_NOT_FOUND');
    const properties = snapshot.identity.properties;
    if (properties.identityState !== 'PENDING_VERIFICATION') {
      throw new RegistrationError('REGISTRATION_STATE_CONFLICT');
    }
    if (properties.aggregateVersion.value !== command.expectedVersion) {
      throw new RegistrationError('REGISTRATION_STATE_CONFLICT');
    }
    const primary =
      snapshot.identifiers.find((candidate) => candidate.properties.isPrimary) ??
      snapshot.identifiers[0];
    if (primary === undefined) throw new RegistrationError('REGISTRATION_STATE_CONFLICT');
    if (primary.properties.verificationState === 'VERIFIED') {
      throw new RegistrationError('REGISTRATION_STATE_CONFLICT');
    }
    const expectedChannel: VerificationChannel =
      primary.properties.identifierType === 'EMAIL' ? 'EMAIL' : 'SMS';
    if (command.channelType !== expectedChannel) {
      throw new RegistrationError('VERIFICATION_NOT_PERMITTED');
    }

    const active = await this.verificationChallenges.findActiveByBinding(
      command.registrationId,
      'REGISTRATION_VERIFICATION',
      command.channelType,
    );
    if (active !== null) throw new RegistrationError('CHALLENGE_ALREADY_ACTIVE');

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.otpLifetimeSeconds * 1000);
    const challengeId = this.identifiers.next();
    const issued = this.otpCrypto.issueOtp({
      environment: this.options.environment,
      challengeId: challengeId.value,
      purpose: 'REGISTRATION_VERIFICATION',
    });
    const digest = new ProtectedValue(issued.digest);

    const challenge = new VerificationChallenge({
      challengeId,
      identityId: command.registrationId,
      purpose: 'REGISTRATION_VERIFICATION',
      channelType: command.channelType,
      protectedDestinationReference: new ProtectedValue(
        primary.properties.protectedNormalizedValue.value,
      ),
      challengeDigest: digest,
      challengeState: 'CHALLENGE_ISSUED',
      attemptCount: 0,
      maximumAttempts: this.options.maximumVerificationAttempts,
      expiresAt,
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    const evidence = new OtpEvidenceRecord({
      otpEvidenceId: this.identifiers.next(),
      challengeId,
      evidenceDigest: digest,
      evidenceState: 'ACTIVE',
      expiresAt,
      createdAt: now,
    });

    await this.verificationChallenges.insert({
      challenge,
      otpEvidence: [evidence],
      attemptsToAppend: [],
    });
    try {
      await this.otpDelivery.deliver({
        destination: primary.properties.protectedNormalizedValue.value,
        channel: command.channelType,
        purpose: 'REGISTRATION_VERIFICATION',
        rawOtp: issued.rawValue,
        expiresAt,
      });
    } catch (error) {
      // Provider failure must never silently verify; invalidate the orphaned
      // challenge so a retry is not blocked by the active-challenge guard.
      const cancelled = new VerificationChallenge({
        ...challenge.properties,
        challengeState: 'CANCELLED',
        cancelledAt: now,
        updatedAt: now,
      });
      await this.verificationChallenges.save(
        {
          challenge: cancelled,
          otpEvidence: [evidence],
          attemptsToAppend: [],
        },
        challenge.properties.aggregateVersion,
      );
      throw error;
    }

    return { challengeId: challengeId.value, version: 1, expiresAt };
  }

  /**
   * M01-REG-003. Validates the submitted OTP against the active challenge and,
   * on success, consumes the evidence and marks the primary identifier VERIFIED.
   * Wrong evidence increments the attempt counter; the challenge becomes FAILED
   * once the configured maximum is reached. A verified challenge can never be
   * replayed (single-use, state-guarded atomic confirmation).
   *
   * The challenge consumption and the identifier verification commit in two
   * transactions. If the identifier update fails after a successful OTP, the
   * challenge is spent and the client must request a fresh challenge (REG-002)
   * and confirm again; the identity is never activated on an unverified
   * identifier, so the window cannot escalate privileges.
   */
  public async confirmVerification(
    command: ConfirmVerificationCommand,
  ): Promise<VerificationConfirmationResult> {
    const aggregate = await this.verificationChallenges.findAggregateById(command.challengeId);
    if (aggregate === null) throw new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED');
    const challenge = aggregate.challenge.properties;
    if (
      challenge.identityId?.value !== command.registrationId.value ||
      challenge.purpose !== 'REGISTRATION_VERIFICATION'
    ) {
      throw new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED');
    }
    if (
      challenge.challengeState !== 'CHALLENGE_ISSUED' ||
      challenge.expiresAt <= this.clock.now()
    ) {
      throw new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED');
    }
    if (challenge.aggregateVersion.value !== command.expectedChallengeVersion) {
      throw new RegistrationError('REGISTRATION_STATE_CONFLICT');
    }

    const activeEvidence = aggregate.otpEvidence.find(
      (evidence) => evidence.properties.evidenceState === 'ACTIVE',
    );
    const storedDigest = activeEvidence?.properties.evidenceDigest.value;
    const matches =
      storedDigest !== undefined &&
      this.otpCrypto.matchesOtp(
        command.verificationEvidence,
        {
          environment: this.options.environment,
          challengeId: command.challengeId.value,
          purpose: 'REGISTRATION_VERIFICATION',
        },
        storedDigest,
      );

    const now = this.clock.now();
    if (!matches) {
      const terminal = challenge.attemptCount + 1 >= challenge.maximumAttempts;
      const attempt = new VerificationAttempt({
        verificationAttemptId: this.identifiers.next(),
        challengeId: command.challengeId,
        outcome: terminal ? 'FAILED_SECURELY' : 'REJECTED',
        attemptedAt: now,
        createdAt: now,
        failureReason: 'INVALID_OTP',
      });
      const updatedChallenge = new VerificationChallenge({
        ...challenge,
        challengeState: terminal ? 'FAILED' : 'CHALLENGE_ISSUED',
        attemptCount: challenge.attemptCount + 1,
        aggregateVersion: new AggregateVersion(challenge.aggregateVersion.value + 1),
        updatedAt: now,
      });
      await this.verificationChallenges.rejectOtpChallenge({
        challengeId: command.challengeId,
        attempt,
        expectedVersion: challenge.aggregateVersion,
        rejectedAt: now,
        updatedChallenge,
      });
      throw new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED');
    }

    const attempt = new VerificationAttempt({
      verificationAttemptId: this.identifiers.next(),
      challengeId: command.challengeId,
      outcome: 'SUCCEEDED',
      attemptedAt: now,
      createdAt: now,
    });
    const updatedChallenge = new VerificationChallenge({
      ...challenge,
      challengeState: 'VERIFIED',
      attemptCount: challenge.attemptCount + 1,
      aggregateVersion: new AggregateVersion(challenge.aggregateVersion.value + 1),
      consumedAt: now,
      updatedAt: now,
    });
    const consumedEvidence =
      activeEvidence === undefined
        ? null
        : new OtpEvidenceRecord({
            ...activeEvidence.properties,
            evidenceState: 'CONSUMED',
            consumedAt: now,
          });
    const committed = await this.verificationChallenges.confirmOtpChallenge({
      challengeId: command.challengeId,
      attempt,
      expectedVersion: challenge.aggregateVersion,
      completedAt: now,
      updatedChallenge,
      consumedEvidence,
    });
    if (!committed) throw new RegistrationError('CHALLENGE_INVALID_OR_EXPIRED');

    await this.markPrimaryIdentifierVerified(command.registrationId);
    return {
      status: 'VERIFIED',
      registrationId: command.registrationId.value,
      version: challenge.aggregateVersion.value + 1,
    };
  }

  /**
   * M01-REG-004. Activates the pending registration only after its primary
   * identifier is VERIFIED. Non-activatable registrations are rejected with
   * REGISTRATION_NOT_READY; the transition is recorded and the identity becomes
   * ACTIVE, enabling authentication.
   */
  public async activate(command: ActivateRegistrationCommand): Promise<ActivationResult> {
    const snapshot = await this.identityRepository.findAuthenticationById(command.registrationId);
    if (snapshot === null) throw new RegistrationError('REGISTRATION_NOT_FOUND');
    const properties = snapshot.identity.properties;
    if (properties.identityState !== 'PENDING_VERIFICATION') {
      throw new RegistrationError('REGISTRATION_STATE_CONFLICT');
    }
    if (properties.aggregateVersion.value !== command.expectedVersion) {
      throw new RegistrationError('REGISTRATION_STATE_CONFLICT');
    }
    const primary =
      snapshot.identifiers.find((candidate) => candidate.properties.isPrimary) ??
      snapshot.identifiers[0];
    if (primary?.properties.verificationState !== 'VERIFIED') {
      throw new RegistrationError('REGISTRATION_NOT_READY');
    }

    const now = this.clock.now();
    const updatedVersion = new AggregateVersion(properties.aggregateVersion.value + 1);
    const updatedIdentity = new Identity({
      ...properties,
      identityState: 'ACTIVE',
      verificationState: 'VERIFIED',
      aggregateVersion: updatedVersion,
      updatedAt: now,
    });
    const transition = new IdentityStateTransition({
      identityStateTransitionId: this.identifiers.next(),
      identityId: command.registrationId,
      fromState: 'PENDING_VERIFICATION',
      toState: 'ACTIVE',
      stateVersion: properties.aggregateVersion.value + 1,
      transitionedAt: now,
      createdAt: now,
      reasonCode: 'REGISTRATION_VERIFICATION_COMPLETED',
    });

    await this.identityRepository.save(
      this.buildChangeSet(snapshot, updatedIdentity, [transition]),
      properties.aggregateVersion,
    );

    return {
      status: 'ACTIVE',
      identityState: 'ACTIVE',
      verificationState: 'VERIFIED',
      version: updatedVersion.value,
    };
  }

  /**
   * M01-REG-005. Enumeration-safe status: only the registration id, a coarse
   * status and the version are exposed.
   */
  public async getStatus(registrationId: UuidV7): Promise<RegistrationStatusResult> {
    const snapshot = await this.identityRepository.findAuthenticationById(registrationId);
    if (snapshot === null) throw new RegistrationError('REGISTRATION_NOT_FOUND');
    const properties = snapshot.identity.properties;
    const primary =
      snapshot.identifiers.find((candidate) => candidate.properties.isPrimary) ??
      snapshot.identifiers[0];
    const status: RegistrationStatus =
      properties.identityState === 'ACTIVE'
        ? 'ACTIVE'
        : primary?.properties.verificationState === 'VERIFIED'
          ? 'VERIFIED'
          : 'PENDING_VERIFICATION';
    return {
      registrationId: registrationId.value,
      status,
      version: properties.aggregateVersion.value,
    };
  }

  private async markPrimaryIdentifierVerified(identityId: UuidV7): Promise<void> {
    const snapshot = await this.identityRepository.findAuthenticationById(identityId);
    if (snapshot === null) throw new RegistrationError('REGISTRATION_NOT_FOUND');
    const primary =
      snapshot.identifiers.find((candidate) => candidate.properties.isPrimary) ??
      snapshot.identifiers[0];
    if (primary === undefined || primary.properties.verificationState === 'VERIFIED') return;
    const now = this.clock.now();
    const identifiers = snapshot.identifiers.map((identifier) =>
      identifier.properties.identifierId.value === primary.properties.identifierId.value
        ? new IdentityIdentifier({
            ...identifier.properties,
            verificationState: 'VERIFIED',
            verifiedAt: now,
            updatedAt: now,
          })
        : identifier,
    );
    try {
      await this.identityRepository.save(
        this.buildChangeSet(snapshot, snapshot.identity, [], identifiers),
        snapshot.identity.properties.aggregateVersion,
      );
    } catch {
      // The challenge is already consumed; surface a conflict so the client
      // requests a fresh challenge rather than receiving an opaque 500.
      throw new RegistrationError('REGISTRATION_STATE_CONFLICT');
    }
  }

  private buildChangeSet(
    snapshot: IdentityAuthenticationSnapshot,
    identity: Identity,
    stateTransitionsToAppend: readonly IdentityStateTransition[],
    identifiers: readonly IdentityIdentifier[] = snapshot.identifiers,
  ): IdentityAggregateChangeSet {
    return {
      identity,
      identifiers,
      credentials: snapshot.credentials,
      classificationAssignments: snapshot.classificationAssignments,
      mfaEnrollments: snapshot.mfaEnrollments,
      mfaFactors: snapshot.mfaFactors,
      recoveryCodeSets: [],
      recoveryCodes: [],
      trustedDevices: [],
      credentialHistoryToAppend: [],
      passwordHistoryToAppend: [],
      stateTransitionsToAppend,
    };
  }
}
