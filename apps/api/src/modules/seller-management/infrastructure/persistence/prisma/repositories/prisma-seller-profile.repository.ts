import { Injectable } from '@nestjs/common';
import type { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerAgreement } from '../../../../domain/entities/seller-agreement';
import type { SellerBusinessVerification } from '../../../../domain/entities/seller-business-verification';
import type { SellerIdentityAssociation } from '../../../../domain/entities/seller-identity-association';
import type { SellerOrganization } from '../../../../domain/entities/seller-organization';
import type { SellerProfile } from '../../../../domain/entities/seller-profile';
import type { SellerStateTransition } from '../../../../domain/entities/seller-state-transition';
import type { SellerVerificationEvidence } from '../../../../domain/entities/seller-verification-evidence';
import type { SellerWarehouse } from '../../../../domain/entities/seller-warehouse';
import type {
  SellerAggregateChangeSet,
  SellerProfileRepository,
} from '../../../../domain/ports/seller-repository.port';
import {
  sellerAgreementMapper,
  sellerBusinessAuditRecordMapper,
  sellerBusinessVerificationMapper,
  sellerIdentityAssociationMapper,
  sellerOrganizationMapper,
  sellerProfileMapper,
  sellerStateTransitionMapper,
  sellerVerificationEvidenceMapper,
  sellerWarehouseMapper,
} from '../mappers/seller-management.mapper';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import {
  assertVersionUpdated,
  type TransactionClient,
} from '../../../../../identity-authentication/infrastructure/persistence/prisma/repositories/repository-support';

/**
 * WEMP-M03-PLAN-001 M03-M2. Prisma implementation of the Module 03 seller
 * aggregate repository (WEMP-M03-SPEC-001 §3/§9). All mutations are atomic
 * change sets guarded by the seller-profile aggregate version: save() only
 * applies when the caller's expected version is current, otherwise an
 * OptimisticConcurrencyError is raised and the whole change set rolls back
 * without mutating any state. Cross-module references (identityId,
 * sellerProfileId, organizationId) are logical UUIDv7 values — this repository
 * never reads Module 01 or Module 02 storage.
 */
@Injectable()
export class PrismaSellerProfileRepository implements SellerProfileRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(sellerProfileId: UuidV7): Promise<SellerProfile | null> {
    const record = await this.prisma.sellerProfile.findUnique({
      where: { sellerProfileId: sellerProfileId.value },
    });
    return record === null ? null : sellerProfileMapper.toDomain(record);
  }

  public async findOrganization(organizationId: UuidV7): Promise<SellerOrganization | null> {
    const record = await this.prisma.sellerOrganization.findUnique({
      where: { organizationId: organizationId.value },
    });
    return record === null ? null : sellerOrganizationMapper.toDomain(record);
  }

  public async findAssociations(
    sellerProfileId: UuidV7,
  ): Promise<readonly SellerIdentityAssociation[]> {
    const records = await this.prisma.sellerIdentityAssociation.findMany({
      where: { sellerProfileId: sellerProfileId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => sellerIdentityAssociationMapper.toDomain(record));
  }

  public async findVerifications(
    sellerProfileId: UuidV7,
  ): Promise<readonly SellerBusinessVerification[]> {
    const records = await this.prisma.sellerBusinessVerification.findMany({
      where: { sellerProfileId: sellerProfileId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => sellerBusinessVerificationMapper.toDomain(record));
  }

  public async findEvidence(
    verificationId: UuidV7,
  ): Promise<readonly SellerVerificationEvidence[]> {
    const records = await this.prisma.sellerVerificationEvidence.findMany({
      where: { verificationId: verificationId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => sellerVerificationEvidenceMapper.toDomain(record));
  }

  public async findTransitions(sellerProfileId: UuidV7): Promise<readonly SellerStateTransition[]> {
    const records = await this.prisma.sellerStateTransition.findMany({
      where: { sellerProfileId: sellerProfileId.value },
      orderBy: { stateVersion: 'asc' },
    });
    return records.map((record) => sellerStateTransitionMapper.toDomain(record));
  }

  public async findWarehouses(sellerProfileId: UuidV7): Promise<readonly SellerWarehouse[]> {
    const records = await this.prisma.sellerWarehouse.findMany({
      where: { sellerProfileId: sellerProfileId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => sellerWarehouseMapper.toDomain(record));
  }

  public async findAgreements(sellerProfileId: UuidV7): Promise<readonly SellerAgreement[]> {
    const records = await this.prisma.sellerAgreement.findMany({
      where: { sellerProfileId: sellerProfileId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => sellerAgreementMapper.toDomain(record));
  }

  public async findActiveByRegistrationDigest(
    registrationLookupDigest: string,
  ): Promise<SellerProfile | null> {
    const organization = await this.prisma.sellerOrganization.findUnique({
      where: { registrationLookupDigest },
    });
    if (organization === null) {
      return null;
    }
    const record = await this.prisma.sellerProfile.findFirst({
      where: { organizationId: organization.organizationId, state: 'ACTIVE' },
    });
    return record === null ? null : sellerProfileMapper.toDomain(record);
  }

  public async findProfileByAssociatedIdentityId(
    identityId: UuidV7,
  ): Promise<SellerProfile | null> {
    const association = await this.prisma.sellerIdentityAssociation.findFirst({
      where: { identityId: identityId.value, state: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (association === null) {
      return null;
    }
    return this.findById(new UuidV7(association.sellerProfileId));
  }

  public async findAllSellers(): Promise<readonly SellerProfile[]> {
    const records = await this.prisma.sellerProfile.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => sellerProfileMapper.toDomain(record));
  }

  public async insert(changeSet: SellerAggregateChangeSet): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.sellerProfile.create({
        data: sellerProfileMapper.toPersistence(changeSet.sellerProfile),
      });
      await this.persistOwnedRecords(transaction, changeSet, false);
    });
  }

  public async save(
    changeSet: SellerAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      // Version guard: only the caller holding the current aggregate version
      // may commit. A stale or concurrent change set fails the guard, the
      // transaction rolls back, and no child record is appended.
      const updated = await transaction.sellerProfile.updateMany({
        where: {
          sellerProfileId: changeSet.sellerProfile.properties.sellerProfileId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: sellerProfileMapper.toPersistence(changeSet.sellerProfile),
      });
      assertVersionUpdated(updated.count, 'SellerProfile');
      await this.persistOwnedRecords(transaction, changeSet, true);
    });
  }

  private async persistOwnedRecords(
    transaction: TransactionClient,
    changeSet: SellerAggregateChangeSet,
    upsert: boolean,
  ): Promise<void> {
    if (changeSet.organization !== undefined) {
      const data = sellerOrganizationMapper.toPersistence(changeSet.organization);
      if (upsert)
        await transaction.sellerOrganization.upsert({
          where: { organizationId: changeSet.organization.properties.organizationId.value },
          create: data,
          update: data,
        });
      else await transaction.sellerOrganization.create({ data });
    }
    for (const entity of changeSet.associationsToAppend) {
      const data = sellerIdentityAssociationMapper.toPersistence(entity);
      if (upsert)
        await transaction.sellerIdentityAssociation.upsert({
          where: { associationId: entity.properties.associationId.value },
          create: data,
          update: data,
        });
      else await transaction.sellerIdentityAssociation.create({ data });
    }
    for (const entity of changeSet.verificationsToAppend) {
      const data = sellerBusinessVerificationMapper.toPersistence(entity);
      if (upsert)
        await transaction.sellerBusinessVerification.upsert({
          where: { verificationId: entity.properties.verificationId.value },
          create: data,
          update: data,
        });
      else await transaction.sellerBusinessVerification.create({ data });
    }
    for (const entity of changeSet.evidenceToAppend) {
      await transaction.sellerVerificationEvidence.create({
        data: sellerVerificationEvidenceMapper.toPersistence(entity),
      });
    }
    for (const entity of changeSet.transitionsToAppend) {
      await transaction.sellerStateTransition.create({
        data: sellerStateTransitionMapper.toPersistence(entity),
      });
    }
    for (const entity of changeSet.warehousesToAppend) {
      const data = sellerWarehouseMapper.toPersistence(entity);
      if (upsert)
        await transaction.sellerWarehouse.upsert({
          where: { warehouseId: entity.properties.warehouseId.value },
          create: data,
          update: data,
        });
      else await transaction.sellerWarehouse.create({ data });
    }
    for (const entity of changeSet.agreementsToAppend) {
      const data = sellerAgreementMapper.toPersistence(entity);
      if (upsert)
        await transaction.sellerAgreement.upsert({
          where: { agreementId: entity.properties.agreementId.value },
          create: data,
          update: data,
        });
      else await transaction.sellerAgreement.create({ data });
    }
    // WEMP-M03-SPEC-001 §12.9: mandatory business audit records are appended
    // atomically with the mutation they describe — never updated, never deleted.
    for (const entity of changeSet.auditRecordsToAppend) {
      await transaction.sellerBusinessAuditRecord.create({
        data: sellerBusinessAuditRecordMapper.toPersistence(entity),
      });
    }
  }
}
