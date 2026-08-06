import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import { VerificationAttempt } from '../../domain/verification/entities/verification-attempt';
import { VerificationChallenge } from '../../domain/verification/entities/verification-challenge';
import type { VerificationChallengeRepository } from '../../domain/verification/repositories/verification-challenge-repository';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { AuthenticationError } from '../errors/authentication.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { ProtectedEnvelope } from '../ports/envelope-encryption.port';
import type {
  MfaAuthenticationChallenge,
  MfaAuthenticationPort,
  VerifiedMfaAuthentication,
} from '../ports/mfa-authentication.port';
import type { TotpCryptographicPort } from '../ports/totp-cryptographic.port';

export interface TotpMfaPolicy {
  readonly environment: string;
  readonly challengeLifetimeSeconds: number;
  readonly maximumVerificationAttempts: number;
}

export class TotpMfaAuthenticationAdapter implements MfaAuthenticationPort {
  public constructor(
    private readonly identities: IdentityRepository,
    private readonly challenges: VerificationChallengeRepository,
    private readonly totp: TotpCryptographicPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly policy: TotpMfaPolicy,
  ) {}

  public async issueChallenge(
    identityId: UuidV7,
    factorId: UuidV7,
  ): Promise<MfaAuthenticationChallenge> {
    const snapshot = await this.identities.findAuthenticationById(identityId);
    const factor = snapshot?.mfaFactors.find(
      (candidate) =>
        candidate.properties.mfaFactorId.value === factorId.value &&
        candidate.properties.factorState === 'ACTIVE',
    );
    if (factor === undefined) throw new AuthenticationError('AUTHENTICATION_FAILED');

    const now = this.clock.now();
    const challengeId = this.identifiers.next();
    const challenge = new VerificationChallenge({
      challengeId,
      identityId,
      purpose: 'MFA_AUTHENTICATION',
      channelType: 'AUTHENTICATOR_APPLICATION',
      protectedDestinationReference: new ProtectedValue(`mfa-factor:${factorId.value}`),
      challengeDigest: new ProtectedValue(`totp-challenge:${challengeId.value}`),
      challengeState: 'CHALLENGE_ISSUED',
      attemptCount: 0,
      maximumAttempts: this.policy.maximumVerificationAttempts,
      expiresAt: new Date(now.getTime() + this.policy.challengeLifetimeSeconds * 1000),
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    await this.challenges.insert({ challenge, otpEvidence: [], attemptsToAppend: [] });
    return { challengeId, version: 1 };
  }

  public async verifyChallenge(
    challengeId: UuidV7,
    evidence: string,
  ): Promise<VerifiedMfaAuthentication> {
    const challenge = await this.challenges.findById(challengeId);
    const now = this.clock.now();
    if (challenge === null) throw new AuthenticationError('AUTHENTICATION_FAILED');
    const challengeIdentityId = challenge.properties.identityId;
    if (
      challengeIdentityId === undefined ||
      challenge.properties.purpose !== 'MFA_AUTHENTICATION' ||
      challenge.properties.channelType !== 'AUTHENTICATOR_APPLICATION' ||
      challenge.properties.challengeState !== 'CHALLENGE_ISSUED' ||
      challenge.properties.expiresAt <= now ||
      challenge.properties.attemptCount >= challenge.properties.maximumAttempts
    ) {
      throw new AuthenticationError('AUTHENTICATION_FAILED');
    }

    const factorId = parseFactorId(challenge.properties.protectedDestinationReference.value);
    const snapshot = await this.identities.findAuthenticationById(challengeIdentityId);
    const factor = snapshot?.mfaFactors.find(
      (candidate) =>
        candidate.properties.mfaFactorId.value === factorId.value &&
        candidate.properties.factorState === 'ACTIVE',
    );
    if (factor === undefined) throw new AuthenticationError('AUTHENTICATION_FAILED');

    const result = this.totp.verify(
      evidence,
      parseEnvelope(factor.properties.encryptedSecretOrReference.value),
      {
        environment: this.policy.environment,
        recordType: 'MfaFactor',
        recordId: factorId.value,
        fieldName: 'totpSecret',
      },
      now,
    );
    const nextAttemptCount = challenge.properties.attemptCount + 1;
    const attempt = new VerificationAttempt({
      verificationAttemptId: this.identifiers.next(),
      challengeId,
      outcome: result.valid ? 'SUCCEEDED' : 'REJECTED',
      attemptedAt: now,
      createdAt: now,
      ...(result.valid ? {} : { failureReason: 'INVALID_TOTP_EVIDENCE' }),
    });

    if (!result.valid || result.matchedTimeStep === undefined) {
      await this.challenges.rejectTotpChallenge({
        challengeId,
        attempt,
        expectedVersion: challenge.properties.aggregateVersion,
        rejectedAt: now,
        terminal: nextAttemptCount >= challenge.properties.maximumAttempts,
      });
      throw new AuthenticationError('AUTHENTICATION_FAILED');
    }

    const completed = await this.challenges.completeTotpChallenge({
      challengeId,
      factorId,
      candidateTimeStep: result.matchedTimeStep,
      attempt,
      expectedVersion: challenge.properties.aggregateVersion,
      completedAt: now,
    });
    if (!completed) throw new AuthenticationError('AUTHENTICATION_FAILED');
    return {
      identityId: challengeIdentityId,
      authenticationMethod: 'TOTP_AUTHENTICATOR',
    };
  }
}

function parseFactorId(reference: string): UuidV7 {
  if (!reference.startsWith('mfa-factor:')) throw new AuthenticationError('AUTHENTICATION_FAILED');
  return new UuidV7(reference.slice('mfa-factor:'.length));
}

function parseEnvelope(serialized: string): ProtectedEnvelope {
  try {
    return JSON.parse(serialized) as ProtectedEnvelope;
  } catch {
    throw new AuthenticationError('AUTHENTICATION_FAILED');
  }
}
