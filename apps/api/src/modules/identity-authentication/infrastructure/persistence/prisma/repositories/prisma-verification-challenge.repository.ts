import { Injectable } from '@nestjs/common';
import type { VerificationChallenge } from '../../../../domain/verification/entities/verification-challenge';
import type {
  CompleteTotpChallengePersistenceCommand,
  ConfirmOtpChallengePersistenceCommand,
  RejectOtpChallengePersistenceCommand,
  RejectTotpChallengePersistenceCommand,
  VerificationAggregateChangeSet,
  VerificationChallengeAggregate,
  VerificationChallengeRepository,
} from '../../../../domain/verification/repositories/verification-challenge-repository';
import type { VerificationChannel } from '../../../../domain/verification/value-objects/verification-channel';
import type { VerificationPurpose } from '../../../../domain/verification/value-objects/verification-purpose';
import type { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import {
  otpEvidenceMapper,
  verificationAttemptMapper,
  verificationChallengeMapper,
} from '../mappers/verification.mapper';
import { PrismaService } from '../prisma.service';
import { assertVersionUpdated, type TransactionClient } from './repository-support';

@Injectable()
export class PrismaVerificationChallengeRepository implements VerificationChallengeRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(challengeId: UuidV7): Promise<VerificationChallenge | null> {
    const record = await this.prisma.verificationChallenge.findUnique({
      where: { challengeId: challengeId.value },
    });
    return record === null ? null : verificationChallengeMapper.toDomain(record);
  }

  public async findAggregateById(
    challengeId: UuidV7,
  ): Promise<VerificationChallengeAggregate | null> {
    const record = await this.prisma.verificationChallenge.findUnique({
      where: { challengeId: challengeId.value },
      include: { otpEvidence: true },
    });
    if (record === null) return null;
    return Object.freeze({
      challenge: verificationChallengeMapper.toDomain(record),
      otpEvidence: Object.freeze(
        record.otpEvidence.map((evidence) => otpEvidenceMapper.toDomain(evidence)),
      ),
    });
  }

  public async expireActiveChallengesForIdentity(
    identityId: UuidV7,
    purpose: VerificationPurpose,
  ): Promise<number> {
    const result = await this.prisma.verificationChallenge.updateMany({
      where: {
        identityId: identityId.value,
        purpose,
        challengeState: { in: ['CREATED', 'PENDING', 'CHALLENGE_ISSUED'] },
      },
      data: {
        challengeState: 'EXPIRED',
        aggregateVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    return result.count;
  }

  public async findActiveByBinding(
    identityId: UuidV7,
    purpose: VerificationPurpose,
    channelType: VerificationChannel,
  ): Promise<VerificationChallenge | null> {
    const record = await this.prisma.verificationChallenge.findFirst({
      where: {
        identityId: identityId.value,
        purpose,
        channelType,
        challengeState: 'CHALLENGE_ISSUED',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return record === null ? null : verificationChallengeMapper.toDomain(record);
  }

  public async confirmOtpChallenge(
    command: ConfirmOtpChallengePersistenceCommand,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const challenge = await transaction.verificationChallenge.updateMany({
        where: {
          challengeId: command.challengeId.value,
          challengeState: 'CHALLENGE_ISSUED',
          aggregateVersion: command.expectedVersion.value,
          expiresAt: { gt: command.completedAt },
        },
        data: verificationChallengeMapper.toPersistence(command.updatedChallenge),
      });
      if (challenge.count !== 1) return false;
      if (command.consumedEvidence !== null) {
        await transaction.otpEvidenceRecord.update({
          where: { otpEvidenceId: command.consumedEvidence.properties.otpEvidenceId.value },
          data: otpEvidenceMapper.toPersistence(command.consumedEvidence),
        });
      }
      await transaction.verificationAttempt.create({
        data: verificationAttemptMapper.toPersistence(command.attempt),
      });
      return true;
    });
  }

  public async rejectOtpChallenge(command: RejectOtpChallengePersistenceCommand): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const challenge = await transaction.verificationChallenge.updateMany({
        where: {
          challengeId: command.challengeId.value,
          challengeState: 'CHALLENGE_ISSUED',
          aggregateVersion: command.expectedVersion.value,
        },
        data: verificationChallengeMapper.toPersistence(command.updatedChallenge),
      });
      if (challenge.count !== 1) return false;
      await transaction.verificationAttempt.create({
        data: verificationAttemptMapper.toPersistence(command.attempt),
      });
      return true;
    });
  }

  public async completeTotpChallenge(
    command: CompleteTotpChallengePersistenceCommand,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const factor = await transaction.mfaFactor.updateMany({
        where: {
          mfaFactorId: command.factorId.value,
          factorType: 'TOTP_AUTHENTICATOR',
          factorState: 'ACTIVE',
          OR: [
            { lastAcceptedTimeStep: null },
            { lastAcceptedTimeStep: { lt: command.candidateTimeStep } },
          ],
        },
        data: {
          lastAcceptedTimeStep: command.candidateTimeStep,
          lastUsedAt: command.completedAt,
          updatedAt: command.completedAt,
        },
      });
      if (factor.count !== 1) return false;

      const challenge = await transaction.verificationChallenge.updateMany({
        where: {
          challengeId: command.challengeId.value,
          challengeState: 'CHALLENGE_ISSUED',
          aggregateVersion: command.expectedVersion.value,
          expiresAt: { gt: command.completedAt },
        },
        data: {
          challengeState: 'VERIFIED',
          attemptCount: { increment: 1 },
          aggregateVersion: { increment: 1 },
          consumedAt: command.completedAt,
          updatedAt: command.completedAt,
        },
      });
      if (challenge.count !== 1) throw new Error('TOTP challenge changed concurrently');
      await transaction.verificationAttempt.create({
        data: verificationAttemptMapper.toPersistence(command.attempt),
      });
      return true;
    });
  }

  public async rejectTotpChallenge(
    command: RejectTotpChallengePersistenceCommand,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const challenge = await transaction.verificationChallenge.updateMany({
        where: {
          challengeId: command.challengeId.value,
          challengeState: 'CHALLENGE_ISSUED',
          aggregateVersion: command.expectedVersion.value,
        },
        data: {
          challengeState: command.terminal ? 'FAILED' : 'CHALLENGE_ISSUED',
          attemptCount: { increment: 1 },
          aggregateVersion: { increment: 1 },
          updatedAt: command.rejectedAt,
        },
      });
      if (challenge.count !== 1) return false;
      await transaction.verificationAttempt.create({
        data: verificationAttemptMapper.toPersistence(command.attempt),
      });
      return true;
    });
  }

  public async insert(changeSet: VerificationAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.verificationChallenge.create({
        data: verificationChallengeMapper.toPersistence(changeSet.challenge),
      });
      await this.persistOwnedRecords(transaction, changeSet, false);
    });
  }

  public async save(
    changeSet: VerificationAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.verificationChallenge.updateMany({
        where: {
          challengeId: changeSet.challenge.properties.challengeId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: verificationChallengeMapper.toPersistence(changeSet.challenge),
      });
      assertVersionUpdated(result.count, 'VerificationChallenge');
      await this.persistOwnedRecords(transaction, changeSet, true);
    });
  }

  private async persistOwnedRecords(
    transaction: TransactionClient,
    changeSet: VerificationAggregateChangeSet,
    upsert: boolean,
  ): Promise<void> {
    for (const entity of changeSet.otpEvidence) {
      const data = otpEvidenceMapper.toPersistence(entity);
      if (upsert)
        await transaction.otpEvidenceRecord.upsert({
          where: { otpEvidenceId: entity.properties.otpEvidenceId.value },
          create: data,
          update: data,
        });
      else await transaction.otpEvidenceRecord.create({ data });
    }
    for (const entity of changeSet.attemptsToAppend)
      await transaction.verificationAttempt.create({
        data: verificationAttemptMapper.toPersistence(entity),
      });
  }
}
