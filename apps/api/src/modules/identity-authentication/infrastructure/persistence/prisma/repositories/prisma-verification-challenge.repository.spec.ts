import { OtpEvidenceRecord } from '../../../../domain/verification/entities/otp-evidence-record';
import { VerificationAttempt } from '../../../../domain/verification/entities/verification-attempt';
import { VerificationChallenge } from '../../../../domain/verification/entities/verification-challenge';
import { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import type { PrismaService } from '../prisma.service';
import { PrismaVerificationChallengeRepository } from './prisma-verification-challenge.repository';

const challengeId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000301');
const identityId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000302');
const factorId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000303');
const evidenceId = new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000304');
const createdAt = new Date('2026-08-05T00:00:00.000Z');
const completedAt = new Date('2026-08-05T00:05:00.000Z');

function challenge(
  state: 'CHALLENGE_ISSUED' | 'VERIFIED',
  consumed = false,
): VerificationChallenge {
  return new VerificationChallenge({
    challengeId,
    identityId,
    purpose: 'MFA_AUTHENTICATION',
    channelType: 'AUTHENTICATOR_APPLICATION',
    protectedDestinationReference: new ProtectedValue('destination'),
    challengeDigest: new ProtectedValue('digest'),
    challengeState: state,
    attemptCount: 1,
    maximumAttempts: 5,
    expiresAt: completedAt,
    aggregateVersion: new AggregateVersion(1),
    createdAt,
    updatedAt: createdAt,
    ...(consumed ? { consumedAt: completedAt } : {}),
  });
}

function evidence(): OtpEvidenceRecord {
  return new OtpEvidenceRecord({
    otpEvidenceId: evidenceId,
    challengeId,
    evidenceDigest: new ProtectedValue('digest'),
    evidenceState: 'ACTIVE',
    expiresAt: completedAt,
    createdAt,
  });
}

function attempt(): VerificationAttempt {
  return new VerificationAttempt({
    verificationAttemptId: new UuidV7('018f22e2-79b0-7cc3-8c5e-000000000305'),
    challengeId,
    outcome: 'SUCCEEDED',
    attemptedAt: completedAt,
    createdAt: completedAt,
  });
}

function prismaWith(transaction: Record<string, unknown>): PrismaService {
  return {
    $transaction: jest.fn(async (operation: (client: never) => Promise<unknown>) =>
      operation(transaction as never),
    ),
  } as unknown as PrismaService;
}

function record(): Record<string, unknown> {
  return {
    challengeId: challengeId.value,
    identityId: identityId.value,
    purpose: 'MFA_AUTHENTICATION',
    channelType: 'AUTHENTICATOR_APPLICATION',
    protectedDestinationReference: 'protected-destination',
    challengeDigest: 'protected-digest',
    challengeState: 'CHALLENGE_ISSUED',
    attemptCount: 1,
    maximumAttempts: 5,
    expiresAt: completedAt,
    aggregateVersion: 1,
    createdAt,
    updatedAt: createdAt,
    consumedAt: null,
    cancelledAt: null,
    correlationId: null,
  };
}

describe('PrismaVerificationChallengeRepository', () => {
  it('loads a challenge by id and returns null when absent', async () => {
    const found = { findUnique: jest.fn().mockResolvedValue(record()) };
    const foundPrisma = { verificationChallenge: found } as unknown as PrismaService;
    expect(
      (await new PrismaVerificationChallengeRepository(foundPrisma).findById(challengeId))
        ?.properties.challengeId.value,
    ).toBe(challengeId.value);

    const missing = { findUnique: jest.fn().mockResolvedValue(null) };
    const missingPrisma = { verificationChallenge: missing } as unknown as PrismaService;
    await expect(
      new PrismaVerificationChallengeRepository(missingPrisma).findById(challengeId),
    ).resolves.toBeNull();
  });

  it('loads the aggregate with its OTP evidence and returns null when absent', async () => {
    const found = {
      findUnique: jest.fn().mockResolvedValue({
        ...record(),
        otpEvidence: [
          {
            ...record(),
            otpEvidenceId: evidenceId.value,
            challengeId: challengeId.value,
            evidenceDigest: 'd',
            evidenceState: 'ACTIVE',
            expiresAt: completedAt,
            consumedAt: null,
          },
        ],
      }),
    };
    const aggregate = await new PrismaVerificationChallengeRepository({
      verificationChallenge: found,
    } as unknown as PrismaService).findAggregateById(challengeId);

    expect(aggregate?.otpEvidence).toHaveLength(1);

    const missing = { findUnique: jest.fn().mockResolvedValue(null) };
    await expect(
      new PrismaVerificationChallengeRepository({
        verificationChallenge: missing,
      } as unknown as PrismaService).findAggregateById(challengeId),
    ).resolves.toBeNull();
  });

  it('finds the active challenge bound to identity, purpose and channel', async () => {
    const found = { findFirst: jest.fn().mockResolvedValue(record()) };
    const repository = new PrismaVerificationChallengeRepository({
      verificationChallenge: found,
    } as unknown as PrismaService);

    await expect(
      repository.findActiveByBinding(identityId, 'MFA_AUTHENTICATION', 'AUTHENTICATOR_APPLICATION'),
    ).resolves.toBeInstanceOf(VerificationChallenge);
    expect(found.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );

    const missing = { findFirst: jest.fn().mockResolvedValue(null) };
    await expect(
      new PrismaVerificationChallengeRepository({
        verificationChallenge: missing,
      } as unknown as PrismaService).findActiveByBinding(
        identityId,
        'MFA_AUTHENTICATION',
        'AUTHENTICATOR_APPLICATION',
      ),
    ).resolves.toBeNull();
  });

  it('confirms an OTP challenge when the versioned update wins', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      verificationChallenge: { updateMany },
      otpEvidenceRecord: { update },
      verificationAttempt: { create },
    };
    const repository = new PrismaVerificationChallengeRepository(prismaWith(transaction));

    await expect(
      repository.confirmOtpChallenge({
        challengeId,
        attempt: attempt(),
        expectedVersion: new AggregateVersion(1),
        completedAt,
        updatedChallenge: challenge('VERIFIED', true),
        consumedEvidence: evidence(),
      }),
    ).resolves.toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('confirms an OTP challenge without consumed evidence and fails when the update loses', async () => {
    const lost = { count: 0 };
    const updateMany = jest.fn().mockResolvedValueOnce(lost).mockResolvedValueOnce({ count: 1 });
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      verificationChallenge: { updateMany },
      otpEvidenceRecord: { update: jest.fn() },
      verificationAttempt: { create },
    };
    const repository = new PrismaVerificationChallengeRepository(prismaWith(transaction));

    await expect(
      repository.confirmOtpChallenge({
        challengeId,
        attempt: attempt(),
        expectedVersion: new AggregateVersion(1),
        completedAt,
        updatedChallenge: challenge('VERIFIED', true),
        consumedEvidence: null,
      }),
    ).resolves.toBe(false);

    await expect(
      repository.confirmOtpChallenge({
        challengeId,
        attempt: attempt(),
        expectedVersion: new AggregateVersion(1),
        completedAt,
        updatedChallenge: challenge('VERIFIED', true),
        consumedEvidence: null,
      }),
    ).resolves.toBe(true);
  });

  it('rejects an OTP challenge and records the attempt', async () => {
    const transaction = {
      verificationChallenge: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      verificationAttempt: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const repository = new PrismaVerificationChallengeRepository(prismaWith(transaction));

    await expect(
      repository.rejectOtpChallenge({
        challengeId,
        attempt: attempt(),
        expectedVersion: new AggregateVersion(1),
        rejectedAt: completedAt,
        updatedChallenge: challenge('CHALLENGE_ISSUED'),
      }),
    ).resolves.toBe(true);

    const losing = {
      verificationChallenge: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      verificationAttempt: { create: jest.fn() },
    };
    await expect(
      new PrismaVerificationChallengeRepository(prismaWith(losing)).rejectOtpChallenge({
        challengeId,
        attempt: attempt(),
        expectedVersion: new AggregateVersion(1),
        rejectedAt: completedAt,
        updatedChallenge: challenge('CHALLENGE_ISSUED'),
      }),
    ).resolves.toBe(false);
  });

  it('completes a TOTP challenge when both versioned updates win', async () => {
    const transaction = {
      mfaFactor: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      verificationChallenge: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      verificationAttempt: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const repository = new PrismaVerificationChallengeRepository(prismaWith(transaction));

    await expect(
      repository.completeTotpChallenge({
        challengeId,
        factorId,
        candidateTimeStep: 123n,
        attempt: attempt(),
        expectedVersion: new AggregateVersion(1),
        completedAt,
      }),
    ).resolves.toBe(true);
  });

  it('fails a TOTP completion when the factor or challenge update loses', async () => {
    const factorLost = {
      mfaFactor: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      verificationChallenge: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      verificationAttempt: { create: jest.fn() },
    };
    const repository = new PrismaVerificationChallengeRepository(prismaWith(factorLost));

    await expect(
      repository.completeTotpChallenge({
        challengeId,
        factorId,
        candidateTimeStep: 123n,
        attempt: attempt(),
        expectedVersion: new AggregateVersion(1),
        completedAt,
      }),
    ).resolves.toBe(false);

    const challengeLost = {
      mfaFactor: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      verificationChallenge: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      verificationAttempt: { create: jest.fn() },
    };
    await expect(
      new PrismaVerificationChallengeRepository(prismaWith(challengeLost)).completeTotpChallenge({
        challengeId,
        factorId,
        candidateTimeStep: 123n,
        attempt: attempt(),
        expectedVersion: new AggregateVersion(1),
        completedAt,
      }),
    ).rejects.toThrow('TOTP challenge changed concurrently');
  });

  it('rejects a TOTP challenge with terminal and non-terminal states', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 }) as jest.Mock<
      { count: number },
      [{ data: { challengeState: string } }]
    >;
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      verificationChallenge: { updateMany },
      verificationAttempt: { create },
    };
    const repository = new PrismaVerificationChallengeRepository(prismaWith(transaction));

    await repository.rejectTotpChallenge({
      challengeId,
      attempt: attempt(),
      expectedVersion: new AggregateVersion(1),
      rejectedAt: completedAt,
      terminal: true,
    });
    expect(updateMany.mock.calls[0]?.[0].data.challengeState).toBe('FAILED');

    await repository.rejectTotpChallenge({
      challengeId,
      attempt: attempt(),
      expectedVersion: new AggregateVersion(1),
      rejectedAt: completedAt,
      terminal: false,
    });
    expect(updateMany.mock.calls[1]?.[0].data.challengeState).toBe('CHALLENGE_ISSUED');
  });

  it('inserts a new aggregate with owned records', async () => {
    const challengeCreate = jest.fn().mockResolvedValue(undefined);
    const evidenceCreate = jest.fn().mockResolvedValue(undefined);
    const attemptCreate = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      verificationChallenge: { create: challengeCreate },
      otpEvidenceRecord: { create: evidenceCreate },
      verificationAttempt: { create: attemptCreate },
    };
    const repository = new PrismaVerificationChallengeRepository(prismaWith(transaction));

    await repository.insert({
      challenge: challenge('CHALLENGE_ISSUED'),
      otpEvidence: [evidence()],
      attemptsToAppend: [attempt()],
    });

    expect(challengeCreate).toHaveBeenCalledTimes(1);
    expect(evidenceCreate).toHaveBeenCalledTimes(1);
    expect(attemptCreate).toHaveBeenCalledTimes(1);
  });

  it('saves an aggregate with upserted evidence and fails closed on version loss', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const upsert = jest.fn().mockResolvedValue(undefined);
    const attemptCreate = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      verificationChallenge: { updateMany },
      otpEvidenceRecord: { upsert },
      verificationAttempt: { create: attemptCreate },
    };
    const repository = new PrismaVerificationChallengeRepository(prismaWith(transaction));

    await repository.save(
      {
        challenge: challenge('CHALLENGE_ISSUED'),
        otpEvidence: [evidence()],
        attemptsToAppend: [attempt()],
      },
      new AggregateVersion(1),
    );
    expect(upsert).toHaveBeenCalledTimes(1);

    const losing = {
      verificationChallenge: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      otpEvidenceRecord: { upsert: jest.fn() },
      verificationAttempt: { create: jest.fn() },
    };
    await expect(
      new PrismaVerificationChallengeRepository(prismaWith(losing)).save(
        { challenge: challenge('CHALLENGE_ISSUED'), otpEvidence: [], attemptsToAppend: [] },
        new AggregateVersion(1),
      ),
    ).rejects.toThrow('VerificationChallenge was changed by another transaction');
  });
});
