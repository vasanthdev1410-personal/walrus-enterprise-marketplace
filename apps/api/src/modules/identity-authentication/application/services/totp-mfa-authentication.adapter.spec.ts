import { MfaFactor } from '../../domain/identity/entities/mfa-factor';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { VerificationChallenge } from '../../domain/verification/entities/verification-challenge';
import type { VerificationChallengeRepository } from '../../domain/verification/repositories/verification-challenge-repository';
import type { VerificationAggregateChangeSet } from '../../domain/verification/repositories/verification-challenge-repository';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { TotpCryptographicPort } from '../ports/totp-cryptographic.port';
import { TotpMfaAuthenticationAdapter } from './totp-mfa-authentication.adapter';

const identityId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ab');
const factorId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ac');
const enrollmentId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ad');
const challengeId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890ae');
const attemptId = new UuidV7('01890f3e-7b5a-7cc0-8c9d-1234567890af');
const now = new Date('2026-08-05T00:00:00.000Z');

describe('TotpMfaAuthenticationAdapter', () => {
  it('issues a purpose-bound five-minute challenge for an active TOTP factor', async () => {
    const fixture = createFixture();
    const result = await fixture.adapter.issueChallenge(identityId, factorId);

    expect(result).toEqual({ challengeId, version: 1 });
    expect(fixture.insertChallenge).toHaveBeenCalledTimes(1);
    const inserted = fixture.insertChallenge.mock.calls[0]?.[0];
    expect(inserted?.challenge.properties.purpose).toBe('MFA_AUTHENTICATION');
    expect(inserted?.challenge.properties.channelType).toBe('AUTHENTICATOR_APPLICATION');
    expect(inserted?.challenge.properties.maximumAttempts).toBe(5);
    expect(inserted?.challenge.properties.expiresAt).toEqual(new Date(now.getTime() + 300_000));
  });

  it('atomically consumes a valid challenge with its matched replay time step', async () => {
    const fixture = createFixture(createChallenge());
    fixture.verifyTotp.mockReturnValue({ valid: true, matchedTimeStep: 59_000_000n });
    fixture.completeChallenge.mockResolvedValue(true);

    await expect(fixture.adapter.verifyChallenge(challengeId, '123456')).resolves.toEqual({
      identityId,
      authenticationMethod: 'TOTP_AUTHENTICATOR',
    });
    const completed = fixture.completeChallenge.mock.calls[0]?.[0];
    expect(completed?.factorId).toEqual(factorId);
    expect(completed?.candidateTimeStep).toBe(59_000_000n);
  });

  it('records failure and makes the fifth attempt terminal', async () => {
    const fixture = createFixture(createChallenge(4));
    fixture.verifyTotp.mockReturnValue({ valid: false });
    fixture.rejectChallenge.mockResolvedValue(true);

    await expect(fixture.adapter.verifyChallenge(challengeId, '000000')).rejects.toThrow(
      'AUTHENTICATION_FAILED',
    );
    expect(fixture.rejectChallenge.mock.calls[0]?.[0]?.terminal).toBe(true);
  });

  it('rejects an expired challenge without invoking cryptography', async () => {
    const fixture = createFixture(createChallenge(0, new Date(now.getTime() - 1)));
    await expect(fixture.adapter.verifyChallenge(challengeId, '123456')).rejects.toThrow(
      'AUTHENTICATION_FAILED',
    );
    expect(fixture.verifyTotp).not.toHaveBeenCalled();
  });
});

interface Fixture {
  readonly adapter: TotpMfaAuthenticationAdapter;
  readonly insertChallenge: jest.MockedFunction<VerificationChallengeRepository['insert']>;
  readonly completeChallenge: jest.MockedFunction<
    VerificationChallengeRepository['completeTotpChallenge']
  >;
  readonly rejectChallenge: jest.MockedFunction<
    VerificationChallengeRepository['rejectTotpChallenge']
  >;
  readonly verifyTotp: jest.MockedFunction<TotpCryptographicPort['verify']>;
}

function createFixture(challenge: VerificationChallenge | null = null): Fixture {
  const factor = new MfaFactor({
    mfaFactorId: factorId,
    mfaEnrollmentId: enrollmentId,
    factorType: 'TOTP_AUTHENTICATOR',
    factorState: 'ACTIVE',
    encryptedSecretOrReference: new ProtectedValue(
      JSON.stringify({ envelopeVersion: 'walrus-envelope-v1' }),
    ),
    encryptionKeyVersion: 'test-v1',
    createdAt: now,
    updatedAt: now,
    verifiedAt: now,
  });
  const snapshot = { mfaFactors: [factor] } as unknown as IdentityAuthenticationSnapshot;
  const identities = {
    findAuthenticationById: jest.fn().mockResolvedValue(snapshot),
  } as unknown as jest.Mocked<IdentityRepository>;
  const insertChallenge: jest.MockedFunction<
    (changeSet: VerificationAggregateChangeSet) => Promise<void>
  > = jest.fn();
  const completeChallenge: jest.MockedFunction<
    VerificationChallengeRepository['completeTotpChallenge']
  > = jest.fn();
  const rejectChallenge: jest.MockedFunction<
    VerificationChallengeRepository['rejectTotpChallenge']
  > = jest.fn();
  const challenges = {
    findById: jest.fn().mockResolvedValue(challenge),
    findAggregateById: jest.fn(),
    findActiveByBinding: jest.fn(),
    insert: insertChallenge,
    save: jest.fn(),
    completeTotpChallenge: completeChallenge,
    rejectTotpChallenge: rejectChallenge,
    confirmOtpChallenge: jest.fn(),
    rejectOtpChallenge: jest.fn(),
  } as jest.Mocked<VerificationChallengeRepository>;
  const verifyTotp: jest.MockedFunction<TotpCryptographicPort['verify']> = jest.fn();
  const totp: jest.Mocked<TotpCryptographicPort> = {
    createEnrollmentSecret: jest.fn(),
    verify: verifyTotp,
  };
  const clock: ClockPort = { now: () => now };
  const generated = [challengeId, attemptId];
  const identifiers: UuidV7GenerationPort = {
    next: () => generated.shift() ?? attemptId,
  };
  return {
    insertChallenge,
    completeChallenge,
    rejectChallenge,
    verifyTotp,
    adapter: new TotpMfaAuthenticationAdapter(identities, challenges, totp, clock, identifiers, {
      environment: 'test',
      challengeLifetimeSeconds: 300,
      maximumVerificationAttempts: 5,
    }),
  };
}

function createChallenge(
  attemptCount = 0,
  expiresAt = new Date(now.getTime() + 300_000),
): VerificationChallenge {
  return new VerificationChallenge({
    challengeId,
    identityId,
    purpose: 'MFA_AUTHENTICATION',
    channelType: 'AUTHENTICATOR_APPLICATION',
    protectedDestinationReference: new ProtectedValue(`mfa-factor:${factorId.value}`),
    challengeDigest: new ProtectedValue(`totp-challenge:${challengeId.value}`),
    challengeState: 'CHALLENGE_ISSUED',
    attemptCount,
    maximumAttempts: 5,
    expiresAt,
    aggregateVersion: new AggregateVersion(attemptCount + 1),
    createdAt: new Date(now.getTime() - 300_000),
    updatedAt: now,
  });
}
