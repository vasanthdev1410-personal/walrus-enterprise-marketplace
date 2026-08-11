import { Identity } from '../../domain/identity/entities/identity';
import { MfaEnrollment } from '../../domain/identity/entities/mfa-enrollment';
import { MfaFactor } from '../../domain/identity/entities/mfa-factor';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import type { MfaEnrollmentState } from '../../domain/identity/value-objects/mfa-factor-type';
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { VerificationAttempt } from '../../domain/verification/entities/verification-attempt';
import { VerificationChallenge } from '../../domain/verification/entities/verification-challenge';
import type { VerificationChallengeRepository } from '../../domain/verification/repositories/verification-challenge-repository';
import { MfaError } from '../errors/mfa.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type {
  EnvelopeEncryptionContext,
  ProtectedEnvelope,
} from '../ports/envelope-encryption.port';
import type { TotpCryptographicPort } from '../ports/totp-cryptographic.port';

export interface MfaEnrollmentPolicy {
  readonly environment: string;
  readonly challengeLifetimeSeconds: number;
  readonly maximumVerificationAttempts: number;
}

/**
 * M01-MFA-001. Starts a purpose-bound TOTP enrollment for an authenticated
 * identity. The enrollment and its PENDING_VERIFICATION factor are created
 * with a freshly generated, envelope-encrypted TOTP secret (C7 context bound
 * to environment, Module 01, identity, factor type and factor identifier).
 * A single MFA_ENROLLMENT verification challenge is issued; the setup secret
 * is returned exactly once and never persisted in recoverable form.
 */
export interface StartMfaEnrollmentCommand {
  readonly identityId: UuidV7;
  readonly expectedIdentityVersion: number;
  /** Validated at the HTTP boundary (MfaEnrollmentRequestDto); the service re-checks. */
  readonly factorType: string;
}

export interface MfaEnrollmentStartedResult {
  readonly enrollmentId: string;
  readonly enrollmentState: 'PENDING_VERIFICATION';
  readonly protectedSetupMaterial: { readonly secret: string };
  readonly expiresAt: Date;
  readonly version: number;
}

/**
 * M01-MFA-002. Confirms the enrollment by proving possession of the TOTP
 * secret. The confirmation is bound to the caller's identity and the
 * enrollment started for it (enrollment-bound session); the challenge version
 * travels in If-Match. On success the factor and enrollment are activated
 * atomically together with challenge consumption and the TOTP replay guard.
 */
export interface ConfirmMfaEnrollmentCommand {
  readonly identityId: UuidV7;
  readonly enrollmentId: UuidV7;
  readonly expectedEnrollmentVersion: number;
  readonly verificationEvidence: string;
}

export interface MfaEnabledResult {
  readonly enrollmentId: string;
  readonly enrollmentState: 'ACTIVE';
  /**
   * Recovery codes are issued only at the approved one-time issuance point
   * (M01-MFA-005 / M01-REC-006). This milestone returns an empty set and never
   * fabricates codes.
   */
  readonly recoveryCodes: readonly unknown[];
  readonly version: number;
}

/**
 * M01-MFA-003. Reads the caller's MFA status. No MFA secret, digest or setup
 * material is ever exposed. The version reflects the enrollment-bound
 * verification challenge lifecycle: 0 = not enrolled or disabled,
 * 1 = pending verification, 2 = active (challenge consumed).
 */
export interface MfaStatusResult {
  readonly enrollmentState: MfaEnrollmentState | 'NOT_ENROLLED';
  readonly activeFactorTypes: readonly string[];
  readonly replacementRequired: boolean;
  readonly recoveryCodeCount: number;
  readonly version: number;
}

/**
 * MFA enrollment lifecycle (M01-MFA-001, M01-MFA-002, M01-MFA-003).
 *
 * The flow reuses the purpose-bound verification challenge architecture: the
 * challenge purpose is MFA_ENROLLMENT with the AUTHENTICATOR_APPLICATION
 * channel, exactly one live enrollment challenge may exist per identity, and
 * the challenge is single-use with bounded attempts and a hard expiry. The
 * TOTP secret is stored through the approved TOTP cryptographic port (envelope
 * encryption) and never written to logs, idempotency records or responses
 * after the single setup-material issuance.
 */
export class MfaEnrollmentApplicationService {
  public constructor(
    private readonly identities: IdentityRepository,
    private readonly challenges: VerificationChallengeRepository,
    private readonly totp: TotpCryptographicPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly policy: MfaEnrollmentPolicy,
  ) {}

  /**
   * M01-MFA-001. Enrollment requires an ACTIVE, VERIFIED identity. One ACTIVE
   * enrollment blocks re-enrollment, as does a pending enrollment whose
   * challenge is still live (one active challenge per identity). A pending
   * enrollment whose challenge has expired or been consumed is superseded
   * (disabled with its factor revoked) so a caller who lost the setup material
   * is never permanently locked out of enrolling. The identity write is
   * version-guarded (If-Match), so a stale client view yields
   * RESOURCE_STATE_CONFLICT with no partial state.
   */
  public async startEnrollment(
    command: StartMfaEnrollmentCommand,
  ): Promise<MfaEnrollmentStartedResult> {
    if (command.factorType !== 'TOTP_AUTHENTICATOR') {
      throw new MfaError('MFA_ENROLLMENT_NOT_PERMITTED');
    }
    const snapshot = await this.identities.findAuthenticationById(command.identityId);
    if (
      snapshot?.identity.properties.identityState !== 'ACTIVE' ||
      snapshot.identity.properties.verificationState !== 'VERIFIED'
    ) {
      throw new MfaError('MFA_ENROLLMENT_NOT_PERMITTED');
    }

    const now = this.clock.now();
    const activeEnrollment = snapshot.mfaEnrollments.find(
      (candidate) => candidate.properties.enrollmentState === 'ACTIVE',
    );
    if (activeEnrollment !== undefined) {
      throw new MfaError('MFA_ENROLLMENT_NOT_PERMITTED');
    }

    const pendingEnrollment = snapshot.mfaEnrollments.find(
      (candidate) => candidate.properties.enrollmentState === 'PENDING_VERIFICATION',
    );
    let supersededEnrollment: MfaEnrollment | undefined;
    let supersededFactors: readonly MfaFactor[] = [];
    if (pendingEnrollment !== undefined) {
      const liveChallenge = await this.challenges.findActiveByBinding(
        command.identityId,
        'MFA_ENROLLMENT',
        'AUTHENTICATOR_APPLICATION',
      );
      if (liveChallenge !== null) {
        // A live enrollment challenge exists: one active challenge per identity.
        throw new MfaError('MFA_ENROLLMENT_NOT_PERMITTED');
      }
      supersededEnrollment = new MfaEnrollment({
        ...pendingEnrollment.properties,
        enrollmentState: 'DISABLED',
        disabledAt: now,
        updatedAt: now,
      });
      supersededFactors = snapshot.mfaFactors
        .filter(
          (candidate) =>
            candidate.properties.mfaEnrollmentId.value ===
            pendingEnrollment.properties.mfaEnrollmentId.value,
        )
        .map(
          (candidate) =>
            new MfaFactor({
              ...candidate.properties,
              factorState: 'REVOKED',
              revokedAt: now,
              updatedAt: now,
            }),
        );
    }

    const enrollmentId = this.identifiers.next();
    const factorId = this.identifiers.next();
    const challengeId = this.identifiers.next();
    const context: EnvelopeEncryptionContext = {
      environment: this.policy.environment,
      recordType: 'MfaFactor',
      recordId: factorId.value,
      fieldName: 'totpSecret',
    };
    const enrollmentSecret = this.totp.createEnrollmentSecret(context);
    const expiresAt = new Date(now.getTime() + this.policy.challengeLifetimeSeconds * 1000);

    const enrollment = new MfaEnrollment({
      mfaEnrollmentId: enrollmentId,
      identityId: command.identityId,
      enrollmentState: 'PENDING_VERIFICATION',
      createdAt: now,
      updatedAt: now,
    });
    const factor = new MfaFactor({
      mfaFactorId: factorId,
      mfaEnrollmentId: enrollmentId,
      factorType: 'TOTP_AUTHENTICATOR',
      factorState: 'PENDING_VERIFICATION',
      encryptedSecretOrReference: new ProtectedValue(
        JSON.stringify(enrollmentSecret.protectedEnvelope),
      ),
      encryptionKeyVersion: enrollmentSecret.protectedEnvelope.kekVersion,
      createdAt: now,
      updatedAt: now,
    });
    const challenge = new VerificationChallenge({
      challengeId,
      identityId: command.identityId,
      purpose: 'MFA_ENROLLMENT',
      channelType: 'AUTHENTICATOR_APPLICATION',
      protectedDestinationReference: new ProtectedValue(`mfa-enrollment:${enrollmentId.value}`),
      challengeDigest: new ProtectedValue(`mfa-enrollment-challenge:${challengeId.value}`),
      challengeState: 'CHALLENGE_ISSUED',
      attemptCount: 0,
      maximumAttempts: this.policy.maximumVerificationAttempts,
      expiresAt,
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });

    const pendingEnrollmentId = pendingEnrollment?.properties.mfaEnrollmentId.value;
    const updatedIdentity = new Identity({
      ...snapshot.identity.properties,
      aggregateVersion: new AggregateVersion(
        snapshot.identity.properties.aggregateVersion.value + 1,
      ),
      updatedAt: now,
    });
    try {
      await this.identities.save(
        {
          identity: updatedIdentity,
          identifiers: snapshot.identifiers,
          credentials: snapshot.credentials,
          classificationAssignments: snapshot.classificationAssignments,
          mfaEnrollments: [
            ...snapshot.mfaEnrollments.filter(
              (candidate) => candidate.properties.mfaEnrollmentId.value !== pendingEnrollmentId,
            ),
            ...(supersededEnrollment === undefined ? [] : [supersededEnrollment]),
            enrollment,
          ],
          mfaFactors: [
            ...snapshot.mfaFactors.filter(
              (candidate) => candidate.properties.mfaEnrollmentId.value !== pendingEnrollmentId,
            ),
            ...supersededFactors,
            factor,
          ],
          recoveryCodeSets: [],
          recoveryCodes: [],
          trustedDevices: [],
          credentialHistoryToAppend: [],
          passwordHistoryToAppend: [],
          stateTransitionsToAppend: [],
        },
        new AggregateVersion(command.expectedIdentityVersion),
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        // The identity version in If-Match is stale: nothing was written.
        throw new MfaError('RESOURCE_STATE_CONFLICT');
      }
      throw error;
    }

    await this.challenges.insert({ challenge, otpEvidence: [], attemptsToAppend: [] });

    return {
      enrollmentId: enrollmentId.value,
      enrollmentState: 'PENDING_VERIFICATION',
      protectedSetupMaterial: { secret: enrollmentSecret.base32Secret },
      expiresAt,
      version: 1,
    };
  }

  /**
   * M01-MFA-002. Validates the submitted TOTP code against the purpose-bound
   * MFA_ENROLLMENT challenge and the stored factor secret. Wrong evidence
   * increments the attempt counter (the challenge becomes FAILED at the
   * configured maximum); a verified challenge can never be replayed. Success
   * atomically activates the factor and enrollment, records the accepted TOTP
   * time step (replay guard) and consumes the challenge.
   */
  public async confirmEnrollment(command: ConfirmMfaEnrollmentCommand): Promise<MfaEnabledResult> {
    // Defense-in-depth: an identity deactivated or tombstoned after enrollment
    // started must not remain able to activate MFA.
    const snapshot = await this.identities.findAuthenticationById(command.identityId);
    if (snapshot?.identity.properties.identityState !== 'ACTIVE') {
      throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');
    }
    const enrollment = snapshot.mfaEnrollments.find(
      (candidate) => candidate.properties.mfaEnrollmentId.value === command.enrollmentId.value,
    );
    if (enrollment === undefined) throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');
    if (enrollment.properties.enrollmentState !== 'PENDING_VERIFICATION') {
      throw new MfaError('RESOURCE_STATE_CONFLICT');
    }
    const factor = snapshot.mfaFactors.find(
      (candidate) =>
        candidate.properties.mfaEnrollmentId.value === command.enrollmentId.value &&
        candidate.properties.factorState === 'PENDING_VERIFICATION',
    );
    if (factor === undefined) throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');

    const challenge = await this.challenges.findActiveByBinding(
      command.identityId,
      'MFA_ENROLLMENT',
      'AUTHENTICATOR_APPLICATION',
    );
    const now = this.clock.now();
    if (
      challenge === null ||
      challenge.properties.expiresAt <= now ||
      challenge.properties.attemptCount >= challenge.properties.maximumAttempts
    ) {
      throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');
    }
    if (challenge.properties.aggregateVersion.value !== command.expectedEnrollmentVersion) {
      throw new MfaError('RESOURCE_STATE_CONFLICT');
    }
    if (
      parseEnrollmentReference(challenge.properties.protectedDestinationReference.value).value !==
      command.enrollmentId.value
    ) {
      throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');
    }

    const result = this.totp.verify(
      command.verificationEvidence,
      parseEnvelope(factor.properties.encryptedSecretOrReference.value),
      {
        environment: this.policy.environment,
        recordType: 'MfaFactor',
        recordId: factor.properties.mfaFactorId.value,
        fieldName: 'totpSecret',
      },
      now,
    );
    const nextAttemptCount = challenge.properties.attemptCount + 1;
    const attempt = new VerificationAttempt({
      verificationAttemptId: this.identifiers.next(),
      challengeId: challenge.properties.challengeId,
      outcome: result.valid
        ? 'SUCCEEDED'
        : nextAttemptCount >= challenge.properties.maximumAttempts
          ? 'FAILED_SECURELY'
          : 'REJECTED',
      attemptedAt: now,
      createdAt: now,
      ...(result.valid ? {} : { failureReason: 'INVALID_TOTP_EVIDENCE' }),
    });

    if (!result.valid || result.matchedTimeStep === undefined) {
      await this.challenges.rejectTotpChallenge({
        challengeId: challenge.properties.challengeId,
        attempt,
        expectedVersion: challenge.properties.aggregateVersion,
        rejectedAt: now,
        terminal: nextAttemptCount >= challenge.properties.maximumAttempts,
      });
      throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');
    }

    const completed = await this.challenges.completeMfaEnrollmentChallenge({
      challengeId: challenge.properties.challengeId,
      enrollmentId: command.enrollmentId,
      factorId: factor.properties.mfaFactorId,
      candidateTimeStep: result.matchedTimeStep,
      attempt,
      expectedVersion: challenge.properties.aggregateVersion,
      completedAt: now,
    });
    if (!completed) {
      // The factor/enrollment was concurrently activated or the challenge
      // changed: the enrollment can no longer complete with this evidence.
      throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');
    }

    return {
      enrollmentId: command.enrollmentId.value,
      enrollmentState: 'ACTIVE',
      recoveryCodes: [],
      version: 2,
    };
  }

  /**
   * M01-MFA-003. Status read. Never exposes MFA secrets, digests or setup
   * material. The recovery-code count reflects ACTIVE codes in the current
   * ACTIVE recovery-code set (issued by M01-MFA-005); no set means zero.
   */
  public async readStatus(identityId: UuidV7): Promise<MfaStatusResult> {
    const snapshot = await this.identities.findAuthenticationById(identityId);
    if (snapshot === null) {
      throw new Error('Identity snapshot unavailable for MFA status');
    }
    const recovery = await this.identities.findRecoveryCodeSets(identityId);
    const activeSet = recovery?.recoveryCodeSets.find(
      (set) => set.properties.setState === 'ACTIVE',
    );
    const recoveryCodeCount =
      activeSet === undefined || recovery === null
        ? 0
        : recovery.recoveryCodes.filter(
            (code) =>
              code.properties.recoveryCodeSetId.value ===
                activeSet.properties.recoveryCodeSetId.value &&
              code.properties.codeState === 'ACTIVE',
          ).length;
    const enrollment =
      snapshot.mfaEnrollments.find(
        (candidate) => candidate.properties.enrollmentState === 'ACTIVE',
      ) ??
      snapshot.mfaEnrollments.find(
        (candidate) => candidate.properties.enrollmentState === 'PENDING_VERIFICATION',
      ) ??
      snapshot.mfaEnrollments.find(
        (candidate) => candidate.properties.enrollmentState === 'REPLACEMENT_REQUIRED',
      ) ??
      snapshot.mfaEnrollments.find(
        (candidate) => candidate.properties.enrollmentState === 'DISABLED',
      );

    if (enrollment === undefined) {
      return {
        enrollmentState: 'NOT_ENROLLED',
        activeFactorTypes: [],
        replacementRequired: false,
        recoveryCodeCount: 0,
        version: 0,
      };
    }

    const enrollmentState = enrollment.properties.enrollmentState;
    const activeFactorTypes = [
      ...new Set(
        snapshot.mfaFactors
          .filter((candidate) => candidate.properties.factorState === 'ACTIVE')
          .map((candidate) => candidate.properties.factorType),
      ),
    ];
    const replacementRequired =
      snapshot.mfaEnrollments.some(
        (candidate) => candidate.properties.enrollmentState === 'REPLACEMENT_REQUIRED',
      ) ||
      snapshot.mfaFactors.some(
        (candidate) => candidate.properties.factorState === 'REPLACEMENT_REQUIRED',
      );
    const version =
      enrollmentState === 'PENDING_VERIFICATION' ? 1 : enrollmentState === 'DISABLED' ? 0 : 2;

    return {
      enrollmentState,
      activeFactorTypes,
      replacementRequired,
      recoveryCodeCount,
      version,
    };
  }
}

function parseEnrollmentReference(reference: string): UuidV7 {
  if (!reference.startsWith('mfa-enrollment:')) {
    throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');
  }
  try {
    return new UuidV7(reference.slice('mfa-enrollment:'.length));
  } catch {
    throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');
  }
}

function parseEnvelope(serialized: string): ProtectedEnvelope {
  try {
    return JSON.parse(serialized) as ProtectedEnvelope;
  } catch {
    throw new MfaError('CHALLENGE_INVALID_OR_EXPIRED');
  }
}
