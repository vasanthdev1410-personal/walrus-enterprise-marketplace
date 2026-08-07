import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import { canonicalizeIdentifier } from '../../domain/identity/value-objects/canonicalize-identifier';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { OtpEvidenceRecord } from '../../domain/verification/entities/otp-evidence-record';
import { VerificationAttempt } from '../../domain/verification/entities/verification-attempt';
import { VerificationChallenge } from '../../domain/verification/entities/verification-challenge';
import type { VerificationChallengeRepository } from '../../domain/verification/repositories/verification-challenge-repository';
import type { VerificationPurpose } from '../../domain/verification/value-objects/verification-purpose';
import { VerificationError } from '../errors/verification.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import type { OtpDeliveryPort } from '../ports/otp-delivery.port';
import type { OtpRecoveryCodeCryptographicPort } from '../ports/otp-recovery-code-cryptographic.port';

export interface AuthenticatedVerificationOptions {
  readonly environment: string;
  readonly otpLifetimeSeconds: number;
  readonly maximumVerificationAttempts: number;
}

/** OTP-capable channels; the authenticator-application channel has no OTP delivery. */
export type OtpVerificationChannel = 'EMAIL' | 'SMS';

/**
 * M01-VER-001. Requests a purpose-bound verification challenge for an
 * authenticated identity. This milestone approves the CONTACT_CHANGE_VERIFICATION
 * purpose only; the challenge is bound to the caller's identity, the requested
 * channel and the new destination (the contact the caller intends to add).
 * Destination ownership is checked without ever revealing whether a destination
 * belongs to another identity (enumeration-safe concealment).
 */
export interface RequestVerificationChallengeCommand {
  readonly identityId: UuidV7;
  readonly purpose: VerificationPurpose;
  readonly channelType: OtpVerificationChannel;
  readonly destination: string;
}

export interface VerificationChallengeRequestResult {
  readonly challengeId: string;
  readonly state: 'CHALLENGE_ISSUED';
  readonly expiresAt: Date;
  readonly version: number;
}

/**
 * M01-VER-002. Confirms a purpose-bound verification challenge with the OTP
 * evidence. The challenge is bound to the caller's session identity and is
 * single-use: a confirmed challenge can never be replayed.
 */
export interface ConfirmVerificationChallengeCommand {
  readonly identityId: UuidV7;
  readonly challengeId: UuidV7;
  readonly expectedChallengeVersion: number;
  readonly verificationEvidence: string;
}

export interface VerificationConfirmationResult {
  readonly challengeId: string;
  readonly verificationState: 'VERIFIED';
  readonly verifiedAt: Date;
  readonly version: number;
}

/**
 * Authenticated verification lifecycle (M01-VER-001 and M01-VER-002).
 *
 * Per the approved scope this milestone is verification-only: confirming a
 * challenge proves control of the new destination but does not attach the
 * identifier to the identity. The commit of a verified contact change is a
 * separate follow-up operation; the challenge's protectedDestinationReference
 * retains the canonical destination for that consumer.
 *
 * Safety note for the future commit consumer: the destination-ownership check
 * in M01-VER-001 is not atomic with challenge issuance (TOCTOU). The commit
 * operation MUST atomically re-verify that the destination is still unowned
 * before attaching the verified identifier.
 */
export class VerificationApplicationService {
  public constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly verificationChallenges: VerificationChallengeRepository,
    private readonly otpCrypto: OtpRecoveryCodeCryptographicPort,
    private readonly otpDelivery: OtpDeliveryPort,
    private readonly identifierLookup: IdentifierLookupCryptographicPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly options: AuthenticatedVerificationOptions,
  ) {}

  /**
   * M01-VER-001. Only ACTIVE identities may request a contact-change challenge;
   * the purpose is restricted to CONTACT_CHANGE_VERIFICATION and the destination
   * must parse as the channel's identifier type. A destination already owned by
   * the caller is rejected outright, while a destination owned by another
   * identity returns an indistinguishable pending challenge so identifier
   * existence is never disclosed. Provider failure cancels the orphaned
   * challenge so a retry is not blocked by the active-challenge guard.
   */
  public async requestChallenge(
    command: RequestVerificationChallengeCommand,
  ): Promise<VerificationChallengeRequestResult> {
    const snapshot = await this.identityRepository.findAuthenticationById(command.identityId);
    if (snapshot?.identity.properties.identityState !== 'ACTIVE') {
      throw new VerificationError('VERIFICATION_NOT_PERMITTED');
    }
    if (command.purpose !== 'CONTACT_CHANGE_VERIFICATION') {
      throw new VerificationError('VERIFICATION_NOT_PERMITTED');
    }

    const identifierType: IdentifierType =
      command.channelType === 'EMAIL' ? 'EMAIL' : 'MOBILE';
    const canonicalValue = this.canonicalizeDestination(command.channelType, command.destination);
    if (canonicalValue === null) throw new VerificationError('VERIFICATION_NOT_PERMITTED');

    const lookups = this.identifierLookup.createLookupsForResolution({
      environment: this.options.environment,
      identifierType,
      canonicalValue,
    });
    const lookupProtectedValues = lookups.map((value) => new ProtectedValue(value));
    const destinationOwner = await this.identityRepository.findByIdentifierLookups(
      identifierType,
      lookupProtectedValues,
    );
    if (destinationOwner !== null) {
      if (destinationOwner.identity.properties.identityId.value === command.identityId.value) {
        // The caller already owns this contact; there is nothing to change.
        throw new VerificationError('VERIFICATION_NOT_PERMITTED');
      }
      // The destination belongs to another identity. Never reveal that fact;
      // return a valid-shaped challenge that can never be confirmed.
      return this.concealedChallenge();
    }

    const active = await this.verificationChallenges.findActiveByBinding(
      command.identityId,
      'CONTACT_CHANGE_VERIFICATION',
      command.channelType,
    );
    if (active !== null) throw new VerificationError('CHALLENGE_ALREADY_ACTIVE');

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.otpLifetimeSeconds * 1000);
    const challengeId = this.identifiers.next();
    const issued = this.otpCrypto.issueOtp({
      environment: this.options.environment,
      challengeId: challengeId.value,
      purpose: 'CONTACT_CHANGE_VERIFICATION',
    });
    const digest = new ProtectedValue(issued.digest);

    const challenge = new VerificationChallenge({
      challengeId,
      identityId: command.identityId,
      purpose: 'CONTACT_CHANGE_VERIFICATION',
      channelType: command.channelType,
      protectedDestinationReference: new ProtectedValue(canonicalValue),
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
        destination: canonicalValue,
        channel: command.channelType,
        purpose: 'CONTACT_CHANGE_VERIFICATION',
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

    return { challengeId: challengeId.value, state: 'CHALLENGE_ISSUED', expiresAt, version: 1 };
  }

  /**
   * M01-VER-002. Validates the submitted OTP against the challenge bound to the
   * caller's identity. Wrong evidence increments the attempt counter and the
   * challenge becomes FAILED once the configured maximum is reached. A verified
   * challenge can never be replayed (single-use, state-guarded atomic
   * confirmation). Verification completes the proof of destination control; no
   * identifier is committed in this milestone.
   */
  public async confirmChallenge(
    command: ConfirmVerificationChallengeCommand,
  ): Promise<VerificationConfirmationResult> {
    // Defense-in-depth: a challenge issued to an identity that was deactivated
    // or tombstoned after issuance must not remain confirmable.
    const snapshot = await this.identityRepository.findAuthenticationById(command.identityId);
    if (snapshot?.identity.properties.identityState !== 'ACTIVE') {
      throw new VerificationError('CHALLENGE_INVALID_OR_EXPIRED');
    }
    const aggregate = await this.verificationChallenges.findAggregateById(command.challengeId);
    if (aggregate === null) throw new VerificationError('CHALLENGE_INVALID_OR_EXPIRED');
    const challenge = aggregate.challenge.properties;
    if (
      challenge.identityId?.value !== command.identityId.value ||
      challenge.purpose !== 'CONTACT_CHANGE_VERIFICATION'
    ) {
      throw new VerificationError('CHALLENGE_INVALID_OR_EXPIRED');
    }
    if (
      challenge.challengeState !== 'CHALLENGE_ISSUED' ||
      challenge.expiresAt <= this.clock.now()
    ) {
      throw new VerificationError('CHALLENGE_INVALID_OR_EXPIRED');
    }
    if (challenge.aggregateVersion.value !== command.expectedChallengeVersion) {
      throw new VerificationError('RESOURCE_STATE_CONFLICT');
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
          purpose: 'CONTACT_CHANGE_VERIFICATION',
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
      throw new VerificationError('CHALLENGE_INVALID_OR_EXPIRED');
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
    if (!committed) throw new VerificationError('CHALLENGE_INVALID_OR_EXPIRED');

    return {
      challengeId: command.challengeId.value,
      verificationState: 'VERIFIED',
      verifiedAt: now,
      version: challenge.aggregateVersion.value + 1,
    };
  }

  /**
   * Returns a valid-shaped, unconfirmable challenge used to conceal that a
   * requested destination belongs to another identity. No OTP is issued or
   * delivered and nothing is persisted; confirming the returned challenge id
   * yields CHALLENGE_INVALID_OR_EXPIRED.
   */
  private concealedChallenge(): VerificationChallengeRequestResult {
    const now = this.clock.now();
    return {
      challengeId: this.identifiers.next().value,
      state: 'CHALLENGE_ISSUED',
      expiresAt: new Date(now.getTime() + this.options.otpLifetimeSeconds * 1000),
      version: 1,
    };
  }

  private canonicalizeDestination(
    channelType: OtpVerificationChannel,
    destination: string,
  ): string | null {
    try {
      return canonicalizeIdentifier(channelType === 'EMAIL' ? 'EMAIL' : 'MOBILE', destination);
    } catch {
      return null;
    }
  }
}
