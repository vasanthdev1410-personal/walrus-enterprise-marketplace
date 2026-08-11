import { Credential } from '../../domain/identity/entities/credential';
import { CredentialHistoryRecord } from '../../domain/identity/entities/credential-history-record';
import { Identity } from '../../domain/identity/entities/identity';
import { PasswordHistoryRecord } from '../../domain/identity/entities/password-history-record';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import { canonicalizeIdentifier } from '../../domain/identity/value-objects/canonicalize-identifier';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { OtpEvidenceRecord } from '../../domain/verification/entities/otp-evidence-record';
import { VerificationAttempt } from '../../domain/verification/entities/verification-attempt';
import { VerificationChallenge } from '../../domain/verification/entities/verification-challenge';
import type { VerificationChallengeRepository } from '../../domain/verification/repositories/verification-challenge-repository';
import { PasswordResetError } from '../errors/password-reset.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import type { OtpDeliveryPort } from '../ports/otp-delivery.port';
import type { OtpRecoveryCodeCryptographicPort } from '../ports/otp-recovery-code-cryptographic.port';
import type { PasswordHashingPort } from '../ports/password-hashing.port';

export interface PasswordResetApplicationOptions {
  readonly environment: string;
  readonly otpLifetimeSeconds: number;
  readonly maximumVerificationAttempts: number;
  readonly minimumPasswordLength: number;
  readonly maximumPasswordLength: number;
  readonly passwordHistoryDepth: number;
}

export type PasswordResetChannel = 'EMAIL' | 'SMS';

/**
 * M01-CRED-002. Requests a purpose-bound PASSWORD_RECOVERY challenge for a
 * forgotten password. The endpoint is PUBLIC_ENUMERATION_SAFE: the response
 * always reports acceptance regardless of whether the identifier resolves, and
 * no account existence is ever revealed. When the identifier resolves to an
 * eligible identity, the challenge is bound to that identity and the verified
 * channel destination stored by the server (never a client-supplied address).
 */
export interface RequestPasswordResetCommand {
  readonly identifier: string;
  readonly channelType: PasswordResetChannel;
}

export interface PasswordResetChallengeResult {
  /**
   * Always populated (real or concealed): the response locator header is always
   * present so a caller cannot distinguish an existing account from a
   * no-op by its presence.
   */
  readonly challengeId: string;
  readonly version: number;
  readonly expiresAt: Date;
  /** Whether a challenge was actually issued and an OTP delivered. */
  readonly issued: boolean;
}

/**
 * M01-CRED-003. Confirms the purpose-bound PASSWORD_RECOVERY challenge with the
 * one-time evidence and atomically replaces the forgotten password. The
 * confirmed challenge is the recovery evidence authorizing the operation; no
 * ordinary authenticated Session is required or created. On success every
 * outstanding PASSWORD_RECOVERY challenge of the identity is expired and every
 * active Session and Refresh Token Family is revoked (Password Reset is an
 * approved revocation trigger), so fresh ordinary authentication is required.
 */
export interface ConfirmPasswordResetCommand {
  readonly challengeId: UuidV7;
  readonly expectedChallengeVersion: number;
  readonly verificationEvidence: string;
  readonly newPassword: string;
}

export class PasswordResetApplicationService {
  public constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly verificationChallenges: VerificationChallengeRepository,
    private readonly passwordHashing: PasswordHashingPort,
    private readonly identifierLookup: IdentifierLookupCryptographicPort,
    private readonly otpCrypto: OtpRecoveryCodeCryptographicPort,
    private readonly otpDelivery: OtpDeliveryPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly options: PasswordResetApplicationOptions,
  ) {}

  /**
   * M01-CRED-002. Enumeration-safe forgot-password request.
   *
   * Resolution never discloses account existence: a missing or ineligible
   * identity, an unverified channel, or an already-active challenge all return
   * a valid-shaped concealed locator while nothing is persisted or delivered.
   * An eligible identity with a verified channel receives a purpose-bound
   * PASSWORD_RECOVERY challenge delivered to the server-stored verified
   * destination. An already-active challenge is returned as-is (its OTP was
   * already delivered) so a retry does not generate a second code.
   */
  public async requestReset(
    command: RequestPasswordResetCommand,
  ): Promise<PasswordResetChallengeResult> {
    const identifierType: IdentifierType = command.channelType === 'EMAIL' ? 'EMAIL' : 'MOBILE';
    let canonicalValue: string;
    try {
      canonicalValue = canonicalizeIdentifier(identifierType, command.identifier);
    } catch {
      return this.concealed();
    }
    const lookups = this.identifierLookup.createLookupsForResolution({
      environment: this.options.environment,
      identifierType,
      canonicalValue,
    });
    const snapshot = await this.identityRepository.findByIdentifierLookups(
      identifierType,
      lookups.map((value) => new ProtectedValue(value)),
    );
    if (snapshot === null) return this.concealed();

    const identity = snapshot.identity.properties;
    const eligible =
      identity.identityState === 'ACTIVE' && identity.verificationState === 'VERIFIED';
    if (!eligible) return this.concealed();

    const verifiedChannelIdentifier = snapshot.identifiers.find(
      (candidate) =>
        candidate.properties.identifierType === identifierType &&
        candidate.properties.verificationState === 'VERIFIED',
    );
    if (verifiedChannelIdentifier === undefined) return this.concealed();

    const active = await this.verificationChallenges.findActiveByBinding(
      identity.identityId,
      'PASSWORD_RECOVERY',
      command.channelType,
    );
    if (active !== null) {
      return {
        challengeId: active.properties.challengeId.value,
        version: active.properties.aggregateVersion.value,
        expiresAt: active.properties.expiresAt,
        issued: true,
      };
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.otpLifetimeSeconds * 1000);
    const challengeId = this.identifiers.next();
    const issued = this.otpCrypto.issueOtp({
      environment: this.options.environment,
      challengeId: challengeId.value,
      purpose: 'PASSWORD_RECOVERY',
    });
    const digest = new ProtectedValue(issued.digest);

    const challenge = new VerificationChallenge({
      challengeId,
      identityId: identity.identityId,
      purpose: 'PASSWORD_RECOVERY',
      channelType: command.channelType,
      protectedDestinationReference: verifiedChannelIdentifier.properties.protectedNormalizedValue,
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
        destination: verifiedChannelIdentifier.properties.protectedNormalizedValue.value,
        channel: command.channelType,
        purpose: 'PASSWORD_RECOVERY',
        rawOtp: issued.rawValue,
        expiresAt,
      });
    } catch (error) {
      // Provider failure must never leave a challenge the caller could confirm
      // without having received the OTP; invalidate the orphaned challenge so a
      // retry is not blocked by the active-challenge guard.
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

    return {
      challengeId: challengeId.value,
      version: 1,
      expiresAt,
      issued: true,
    };
  }

  /**
   * M01-CRED-003. Confirms the recovery evidence and sets the new password.
   *
   * Ordering guarantees:
   * - Password policy and reuse history are validated BEFORE the one-time
   *   evidence is consumed, so a rejected password never burns the OTP.
   * - Evidence confirmation is atomic and single-use (version-guarded), so a
   *   verified challenge can never be replayed.
   * - The credential replacement commits atomically (identity version guard):
   *   current PASSWORD -> REPLACED, new ACTIVE credential, immutable
   *   Credential History REPLACED event, and the previous hash appended to
   *   Password History for future reuse checks.
   * - Completion effects: outstanding PASSWORD_RECOVERY challenges are expired
   *   and every active Session and Refresh Token Family is revoked with reason
   *   PASSWORD_RESET (fresh authentication required).
   *
   * Every invalid-evidence path returns the same RECOVERY_OPERATION_NOT_PERMITTED
   * outcome so nothing distinguishes an unknown challenge, a wrong OTP, an
   * expired challenge or an ineligible identity.
   */
  public async confirmReset(command: ConfirmPasswordResetCommand): Promise<void> {
    if (
      command.newPassword.length < this.options.minimumPasswordLength ||
      command.newPassword.length > this.options.maximumPasswordLength
    ) {
      throw new PasswordResetError('PASSWORD_POLICY_FAILED');
    }

    const aggregate = await this.verificationChallenges.findAggregateById(command.challengeId);
    if (aggregate === null) throw new PasswordResetError('RECOVERY_OPERATION_NOT_PERMITTED');
    const challenge = aggregate.challenge.properties;
    if (challenge.purpose !== 'PASSWORD_RECOVERY') {
      throw new PasswordResetError('RECOVERY_OPERATION_NOT_PERMITTED');
    }
    if (
      challenge.challengeState !== 'CHALLENGE_ISSUED' ||
      challenge.expiresAt <= this.clock.now()
    ) {
      throw new PasswordResetError('RECOVERY_OPERATION_NOT_PERMITTED');
    }
    if (challenge.aggregateVersion.value !== command.expectedChallengeVersion) {
      throw new PasswordResetError('RECOVERY_STATE_CONFLICT');
    }
    const identityId = challenge.identityId;
    if (identityId === undefined) throw new PasswordResetError('RECOVERY_OPERATION_NOT_PERMITTED');

    const snapshot = await this.identityRepository.findAuthenticationById(identityId);
    if (
      snapshot?.identity.properties.identityState !== 'ACTIVE' ||
      snapshot.identity.properties.verificationState !== 'VERIFIED'
    ) {
      throw new PasswordResetError('RECOVERY_OPERATION_NOT_PERMITTED');
    }

    const current = snapshot.credentials.find(
      (candidate) =>
        candidate.properties.credentialType === 'PASSWORD' &&
        candidate.properties.credentialState === 'ACTIVE',
    );
    if (current === undefined) throw new PasswordResetError('RECOVERY_OPERATION_NOT_PERMITTED');

    const history = await this.identityRepository.findPasswordHistory(
      identityId,
      this.options.passwordHistoryDepth,
    );
    if (await this.isPasswordReused(command.newPassword, current, history)) {
      throw new PasswordResetError('PASSWORD_POLICY_FAILED');
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
          purpose: 'PASSWORD_RECOVERY',
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
      throw new PasswordResetError('RECOVERY_OPERATION_NOT_PERMITTED');
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
    const confirmed = await this.verificationChallenges.confirmOtpChallenge({
      challengeId: command.challengeId,
      attempt,
      expectedVersion: challenge.aggregateVersion,
      completedAt: now,
      updatedChallenge,
      consumedEvidence,
    });
    if (!confirmed) throw new PasswordResetError('RECOVERY_STATE_CONFLICT');

    const newHash = await this.passwordHashing.hash(command.newPassword);
    const updatedIdentity = new Identity({
      ...snapshot.identity.properties,
      aggregateVersion: new AggregateVersion(
        snapshot.identity.properties.aggregateVersion.value + 1,
      ),
      updatedAt: now,
    });
    const replaced = new Credential({
      ...current.properties,
      credentialState: 'REPLACED',
      replacedAt: now,
      updatedAt: now,
    });
    const issuedCredential = new Credential({
      credentialId: this.identifiers.next(),
      identityId,
      credentialType: 'PASSWORD',
      credentialVersion: current.properties.credentialVersion + 1,
      credentialState: 'ACTIVE',
      protectedSecret: new ProtectedValue(newHash),
      protectionKeyVersion: 'v1',
      createdAt: now,
      updatedAt: now,
    });
    const credentials = [
      ...snapshot.credentials.map((credential) =>
        credential.properties.credentialId.value === current.properties.credentialId.value
          ? replaced
          : credential,
      ),
      issuedCredential,
    ];

    const credentialHistory = new CredentialHistoryRecord({
      credentialHistoryId: this.identifiers.next(),
      identityId,
      credentialType: 'PASSWORD',
      credentialVersion: current.properties.credentialVersion + 1,
      protectedHistoricalValue: current.properties.protectedSecret,
      eventType: 'REPLACED',
      createdAt: now,
      sourceCredentialId: current.properties.credentialId,
    });
    const passwordHistory = new PasswordHistoryRecord({
      passwordHistoryId: this.identifiers.next(),
      identityId,
      passwordHash: current.properties.protectedSecret,
      hashAlgorithmReference: PASSWORD_HASH_ALGORITHM_REFERENCE,
      createdAt: now,
    });

    try {
      await this.identityRepository.save(
        {
          identity: updatedIdentity,
          identifiers: snapshot.identifiers,
          credentials,
          classificationAssignments: snapshot.classificationAssignments,
          mfaEnrollments: snapshot.mfaEnrollments,
          mfaFactors: snapshot.mfaFactors,
          recoveryCodeSets: [],
          recoveryCodes: [],
          trustedDevices: [],
          credentialHistoryToAppend: [credentialHistory],
          passwordHistoryToAppend: [passwordHistory],
          stateTransitionsToAppend: [],
        },
        snapshot.identity.properties.aggregateVersion,
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new PasswordResetError('RECOVERY_STATE_CONFLICT');
      }
      throw error;
    }

    // Mandatory completion effects (approved PASSWORD_RESET policy row): expire
    // any remaining outstanding recovery challenges, then revoke every active
    // Session and Refresh Token Family so fresh authentication is required.
    await this.verificationChallenges.expireActiveChallengesForIdentity(
      identityId,
      'PASSWORD_RECOVERY',
    );
    await this.sessionRepository.revokeAllSessionsForRecovery({
      identityId,
      revokedAt: now,
      revocationReason: 'PASSWORD_RESET',
    });
  }

  private async isPasswordReused(
    candidatePassword: string,
    current: Credential,
    history: readonly PasswordHistoryRecord[],
  ): Promise<boolean> {
    if (
      await this.passwordHashing.verify(candidatePassword, current.properties.protectedSecret.value)
    ) {
      return true;
    }
    for (const record of history) {
      if (
        await this.passwordHashing.verify(candidatePassword, record.properties.passwordHash.value)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns a valid-shaped, non-persisted challenge locator used whenever the
   * request must be concealed (unknown identifier, ineligible identity,
   * unverified channel). Confirming the returned locator yields the same
   * RECOVERY_OPERATION_NOT_PERMITTED outcome as every other invalid path.
   */
  private concealed(): PasswordResetChallengeResult {
    const now = this.clock.now();
    return {
      challengeId: this.identifiers.next().value,
      version: 1,
      expiresAt: new Date(now.getTime() + this.options.otpLifetimeSeconds * 1000),
      issued: false,
    };
  }
}

/** Argon2id v1.3 encodes as $argon2id$v=19$ in the standard encoded hash. */
const PASSWORD_HASH_ALGORITHM_REFERENCE = 'argon2id-v19';
