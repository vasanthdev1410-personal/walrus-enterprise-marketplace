import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client';
import type { Identity } from '../../../../domain/identity/entities/identity';
import type {
  IdentityAuthenticationSnapshot,
  IdentityAggregateChangeSet,
  IdentityRepository,
} from '../../../../domain/identity/repositories/identity-repository';
import type { IdentifierType } from '../../../../domain/identity/value-objects/identifier-type';
import type { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import type { ProtectedValue } from '../../../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import {
  classificationAssignmentMapper,
  credentialHistoryMapper,
  credentialMapper,
  identityIdentifierMapper,
  identityMapper,
  identityStateTransitionMapper,
  mfaEnrollmentMapper,
  mfaFactorMapper,
  passwordHistoryMapper,
  recoveryCodeMapper,
  recoveryCodeSetMapper,
  trustedDeviceMapper,
} from '../mappers/identity.mapper';
import { PrismaService } from '../prisma.service';
import { assertVersionUpdated, type TransactionClient } from './repository-support';

type IdentityAuthenticationRecord = Prisma.IdentityGetPayload<{
  include: {
    identifiers: true;
    credentials: true;
    classificationAssignments: true;
    mfaEnrollments: { include: { factors: true } };
  };
}>;

@Injectable()
export class PrismaIdentityRepository implements IdentityRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(identityId: UuidV7): Promise<Identity | null> {
    const record = await this.prisma.identity.findUnique({
      where: { identityId: identityId.value },
    });
    return record === null ? null : identityMapper.toDomain(record);
  }

  public async advanceTotpReplayState(
    mfaFactorId: UuidV7,
    candidateTimeStep: bigint,
    usedAt: Date,
  ): Promise<boolean> {
    if (candidateTimeStep < 0n) throw new Error('TOTP time step must be non-negative');
    const result = await this.prisma.mfaFactor.updateMany({
      where: {
        mfaFactorId: mfaFactorId.value,
        factorType: 'TOTP_AUTHENTICATOR',
        factorState: 'ACTIVE',
        OR: [{ lastAcceptedTimeStep: null }, { lastAcceptedTimeStep: { lt: candidateTimeStep } }],
      },
      data: {
        lastAcceptedTimeStep: candidateTimeStep,
        lastUsedAt: usedAt,
        updatedAt: usedAt,
      },
    });
    return result.count === 1;
  }

  public async findByIdentifierLookups(
    identifierType: IdentifierType,
    lookupDigests: readonly ProtectedValue[],
  ): Promise<IdentityAuthenticationSnapshot | null> {
    if (lookupDigests.length === 0) return null;
    const record = await this.prisma.identityIdentifier.findFirst({
      where: {
        identifierType,
        lookupDigest: { in: lookupDigests.map((digest) => digest.value) },
      },
      include: {
        identity: {
          include: {
            identifiers: true,
            credentials: true,
            classificationAssignments: true,
            mfaEnrollments: { include: { factors: true } },
          },
        },
      },
    });
    if (record === null) return null;
    return this.toAuthenticationSnapshot(record.identity);
  }

  public async findAuthenticationById(
    identityId: UuidV7,
  ): Promise<IdentityAuthenticationSnapshot | null> {
    const record = await this.prisma.identity.findUnique({
      where: { identityId: identityId.value },
      include: {
        identifiers: true,
        credentials: true,
        classificationAssignments: true,
        mfaEnrollments: { include: { factors: true } },
      },
    });
    return record === null ? null : this.toAuthenticationSnapshot(record);
  }

  private toAuthenticationSnapshot(
    identity: IdentityAuthenticationRecord,
  ): IdentityAuthenticationSnapshot {
    return Object.freeze({
      identity: identityMapper.toDomain(identity),
      identifiers: Object.freeze(
        identity.identifiers.map((identifier) => identityIdentifierMapper.toDomain(identifier)),
      ),
      credentials: Object.freeze(
        identity.credentials.map((credential) => credentialMapper.toDomain(credential)),
      ),
      classificationAssignments: Object.freeze(
        identity.classificationAssignments.map((assignment) =>
          classificationAssignmentMapper.toDomain(assignment),
        ),
      ),
      mfaEnrollments: Object.freeze(
        identity.mfaEnrollments.map((enrollment) => mfaEnrollmentMapper.toDomain(enrollment)),
      ),
      mfaFactors: Object.freeze(
        identity.mfaEnrollments.flatMap((enrollment) =>
          enrollment.factors.map((factor) => mfaFactorMapper.toDomain(factor)),
        ),
      ),
    });
  }

  public async insert(changeSet: IdentityAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.identity.create({ data: identityMapper.toPersistence(changeSet.identity) });
      await this.createOwnedRecords(transaction, changeSet);
    });
  }

  public async save(
    changeSet: IdentityAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const data = identityMapper.toPersistence(changeSet.identity);
      const result = await transaction.identity.updateMany({
        where: {
          identityId: changeSet.identity.properties.identityId.value,
          aggregateVersion: expectedVersion.value,
        },
        data,
      });
      assertVersionUpdated(result.count, 'Identity');
      await this.upsertOwnedRecords(transaction, changeSet);
    });
  }

  private async createOwnedRecords(
    transaction: TransactionClient,
    changeSet: IdentityAggregateChangeSet,
  ): Promise<void> {
    for (const entity of changeSet.identifiers)
      await transaction.identityIdentifier.create({
        data: identityIdentifierMapper.toPersistence(entity),
      });
    for (const entity of changeSet.credentials)
      await transaction.credential.create({ data: credentialMapper.toPersistence(entity) });
    for (const entity of changeSet.classificationAssignments)
      await transaction.authenticationSecurityClassificationAssignment.create({
        data: classificationAssignmentMapper.toPersistence(entity),
      });
    for (const entity of changeSet.mfaEnrollments)
      await transaction.mfaEnrollment.create({ data: mfaEnrollmentMapper.toPersistence(entity) });
    for (const entity of changeSet.mfaFactors)
      await transaction.mfaFactor.create({ data: mfaFactorMapper.toPersistence(entity) });
    for (const entity of changeSet.recoveryCodeSets)
      await transaction.recoveryCodeSet.create({
        data: recoveryCodeSetMapper.toPersistence(entity),
      });
    for (const entity of changeSet.recoveryCodes)
      await transaction.recoveryCodeRecord.create({
        data: recoveryCodeMapper.toPersistence(entity),
      });
    for (const entity of changeSet.trustedDevices)
      await transaction.trustedDevice.create({ data: trustedDeviceMapper.toPersistence(entity) });
    await this.appendOnlyRecords(transaction, changeSet);
  }

  private async upsertOwnedRecords(
    transaction: TransactionClient,
    changeSet: IdentityAggregateChangeSet,
  ): Promise<void> {
    for (const entity of changeSet.identifiers) {
      const data = identityIdentifierMapper.toPersistence(entity);
      await transaction.identityIdentifier.upsert({
        where: { identifierId: entity.properties.identifierId.value },
        create: data,
        update: data,
      });
    }
    for (const entity of changeSet.credentials) {
      const data = credentialMapper.toPersistence(entity);
      await transaction.credential.upsert({
        where: { credentialId: entity.properties.credentialId.value },
        create: data,
        update: data,
      });
    }
    for (const entity of changeSet.classificationAssignments) {
      const data = classificationAssignmentMapper.toPersistence(entity);
      await transaction.authenticationSecurityClassificationAssignment.upsert({
        where: { classificationAssignmentId: entity.properties.classificationAssignmentId.value },
        create: data,
        update: data,
      });
    }
    for (const entity of changeSet.mfaEnrollments) {
      const data = mfaEnrollmentMapper.toPersistence(entity);
      await transaction.mfaEnrollment.upsert({
        where: { mfaEnrollmentId: entity.properties.mfaEnrollmentId.value },
        create: data,
        update: data,
      });
    }
    for (const entity of changeSet.mfaFactors) {
      const data = mfaFactorMapper.toPersistence(entity);
      await transaction.mfaFactor.upsert({
        where: { mfaFactorId: entity.properties.mfaFactorId.value },
        create: data,
        update: data,
      });
    }
    for (const entity of changeSet.recoveryCodeSets) {
      const data = recoveryCodeSetMapper.toPersistence(entity);
      await transaction.recoveryCodeSet.upsert({
        where: { recoveryCodeSetId: entity.properties.recoveryCodeSetId.value },
        create: data,
        update: data,
      });
    }
    for (const entity of changeSet.recoveryCodes) {
      const data = recoveryCodeMapper.toPersistence(entity);
      await transaction.recoveryCodeRecord.upsert({
        where: { recoveryCodeId: entity.properties.recoveryCodeId.value },
        create: data,
        update: data,
      });
    }
    for (const entity of changeSet.trustedDevices) {
      const data = trustedDeviceMapper.toPersistence(entity);
      await transaction.trustedDevice.upsert({
        where: { trustedDeviceId: entity.properties.trustedDeviceId.value },
        create: data,
        update: data,
      });
    }
    await this.appendOnlyRecords(transaction, changeSet);
  }

  private async appendOnlyRecords(
    transaction: TransactionClient,
    changeSet: IdentityAggregateChangeSet,
  ): Promise<void> {
    for (const entity of changeSet.credentialHistoryToAppend)
      await transaction.credentialHistoryRecord.create({
        data: credentialHistoryMapper.toPersistence(entity),
      });
    for (const entity of changeSet.passwordHistoryToAppend)
      await transaction.passwordHistoryRecord.create({
        data: passwordHistoryMapper.toPersistence(entity),
      });
    for (const entity of changeSet.stateTransitionsToAppend)
      await transaction.identityStateTransition.create({
        data: identityStateTransitionMapper.toPersistence(entity),
      });
  }
}
