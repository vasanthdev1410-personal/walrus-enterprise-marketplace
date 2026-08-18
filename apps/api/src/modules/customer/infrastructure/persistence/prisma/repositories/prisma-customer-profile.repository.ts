import { Injectable } from '@nestjs/common';
import type { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import {
  assertVersionUpdated,
  type TransactionClient,
} from '../../../../../identity-authentication/infrastructure/persistence/prisma/repositories/repository-support';
import type { CustomerAddress } from '../../../../domain/entities/customer-address';
import type { CustomerAuditRecord } from '../../../../domain/entities/customer-audit-record';
import type { CustomerBusinessProfile } from '../../../../domain/entities/customer-business-profile';
import type { CustomerPreference } from '../../../../domain/entities/customer-preference';
import type { CustomerProfile } from '../../../../domain/entities/customer-profile';
import type { CustomerStateTransition } from '../../../../domain/entities/customer-state-transition';
import { CustomerAddressPolicy } from '../../../../domain/policy/customer-address.policy';
import type {
  CustomerAggregateChangeSet,
  CustomerProfileRepository,
} from '../../../../domain/ports/customer-repository.port';
import {
  customerAddressMapper,
  customerAuditRecordMapper,
  customerBusinessProfileMapper,
  customerPreferenceMapper,
  customerProfileMapper,
  customerStateTransitionMapper,
} from '../mappers/customer.mapper';

/**
 * WEMP-M06-PLAN-001 M06-M2. Prisma implementation of the Module 06 customer
 * aggregate repository (WEMP-M06-SPEC-001 §13). All mutations are atomic
 * change sets guarded by the customer-profile aggregate version (D-11):
 * save() applies only when the caller's expected version is current, then
 * persists the dependent aggregate changes and appends the mandatory
 * transition/audit records in the same transaction — a stale version raises
 * an OptimisticConcurrencyError and the whole change set rolls back without
 * mutating any state or leaving orphan audit records.
 *
 * Aggregate invariants are re-validated before writing (fail closed): at
 * most one default shipping/billing address per profile (D-04) and business
 * profile 0..1 cardinality (D-05); the database partial unique indexes
 * remain the second line of defense. Cross-module references (identityId,
 * actorIdentityId) are logical UUIDv7 values — this repository never reads
 * Module 01 or Module 02 storage (A-06).
 *
 * Append-only safety (D-02/D-08): CustomerStateTransition and
 * CustomerAuditRecord are only ever created here — no update/delete surface
 * exists on this repository for historical records.
 */
@Injectable()
export class PrismaCustomerProfileRepository implements CustomerProfileRepository {
  private readonly addressPolicy = new CustomerAddressPolicy();

  public constructor(private readonly prisma: PrismaService) {}

  public async findById(customerProfileId: UuidV7): Promise<CustomerProfile | null> {
    const record = await this.prisma.customerProfile.findUnique({
      where: { customerProfileId: customerProfileId.value },
    });
    return record === null ? null : customerProfileMapper.toDomain(record);
  }

  public async findByIdentityId(identityId: UuidV7): Promise<CustomerProfile | null> {
    const record = await this.prisma.customerProfile.findUnique({
      where: { identityId: identityId.value },
    });
    return record === null ? null : customerProfileMapper.toDomain(record);
  }

  public async findAddresses(customerProfileId: UuidV7): Promise<readonly CustomerAddress[]> {
    const records = await this.prisma.customerAddress.findMany({
      where: { customerProfileId: customerProfileId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => customerAddressMapper.toDomain(record));
  }

  public async findBusinessProfile(
    customerProfileId: UuidV7,
  ): Promise<CustomerBusinessProfile | null> {
    const record = await this.prisma.customerBusinessProfile.findUnique({
      where: { customerProfileId: customerProfileId.value },
    });
    return record === null ? null : customerBusinessProfileMapper.toDomain(record);
  }

  public async findPreferences(customerProfileId: UuidV7): Promise<readonly CustomerPreference[]> {
    const records = await this.prisma.customerPreference.findMany({
      where: { customerProfileId: customerProfileId.value },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => customerPreferenceMapper.toDomain(record));
  }

  public async findTransitions(
    customerProfileId: UuidV7,
  ): Promise<readonly CustomerStateTransition[]> {
    const records = await this.prisma.customerStateTransition.findMany({
      where: { customerProfileId: customerProfileId.value },
      orderBy: { stateVersion: 'asc' },
    });
    return records.map((record) => customerStateTransitionMapper.toDomain(record));
  }

  public async findAuditRecords(
    customerProfileId: UuidV7,
  ): Promise<readonly CustomerAuditRecord[]> {
    const records = await this.prisma.customerAuditRecord.findMany({
      where: { customerProfileId: customerProfileId.value },
      orderBy: { occurredAt: 'asc' },
    });
    return records.map((record) => customerAuditRecordMapper.toDomain(record));
  }

  public async insert(changeSet: CustomerAggregateChangeSet): Promise<void> {
    this.assertChangeSetInvariants(changeSet);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.customerProfile.create({
        data: customerProfileMapper.toPersistence(changeSet.customerProfile),
      });
      await this.persistOwnedRecords(transaction, changeSet, false);
    });
  }

  public async save(
    changeSet: CustomerAggregateChangeSet,
    expectedVersion: AggregateVersion,
  ): Promise<void> {
    this.assertChangeSetInvariants(changeSet);
    await this.prisma.$transaction(async (transaction) => {
      // D-11 optimistic-concurrency guard: only the caller holding the
      // current aggregate version may commit. A stale or concurrent change
      // set fails the guard, the transaction rolls back, and no child
      // record or audit record is appended (no partial mutation, no orphan
      // audit record).
      const updated = await transaction.customerProfile.updateMany({
        where: {
          customerProfileId: changeSet.customerProfile.properties.customerProfileId.value,
          aggregateVersion: expectedVersion.value,
        },
        data: customerProfileMapper.toPersistence(changeSet.customerProfile),
      });
      assertVersionUpdated(updated.count, 'CustomerProfile');
      await this.persistOwnedRecords(transaction, changeSet, true);
    });
  }

  /**
   * Re-validates the aggregate address-book invariant before any write (fail
   * closed): at most one default shipping and one default billing address
   * per profile (D-04). The database partial unique indexes remain the
   * second line of defense. Business-profile 0..1 cardinality (D-05) is
   * enforced by the unique customerProfileId constraint at persistence and
   * by the application layer (M06-M3).
   */
  private assertChangeSetInvariants(changeSet: CustomerAggregateChangeSet): void {
    const allAddresses = [...changeSet.addressesToAppend, ...changeSet.addressesToUpdate];
    if (allAddresses.length > 0) {
      this.addressPolicy.assertValidAddresses(allAddresses);
    }
  }

  private async persistOwnedRecords(
    transaction: TransactionClient,
    changeSet: CustomerAggregateChangeSet,
    upsert: boolean,
  ): Promise<void> {
    for (const entity of changeSet.addressesToAppend) {
      const data = customerAddressMapper.toPersistence(entity);
      if (upsert)
        await transaction.customerAddress.upsert({
          where: { addressId: entity.properties.addressId.value },
          create: data,
          update: data,
        });
      else await transaction.customerAddress.create({ data });
    }
    for (const entity of changeSet.addressesToUpdate) {
      await transaction.customerAddress.update({
        where: { addressId: entity.properties.addressId.value },
        data: customerAddressMapper.toPersistence(entity),
      });
    }
    if (changeSet.businessProfile !== undefined) {
      const data = customerBusinessProfileMapper.toPersistence(changeSet.businessProfile);
      if (upsert)
        await transaction.customerBusinessProfile.upsert({
          where: {
            customerBusinessProfileId:
              changeSet.businessProfile.properties.customerBusinessProfileId.value,
          },
          create: data,
          update: data,
        });
      else await transaction.customerBusinessProfile.create({ data });
    }
    for (const entity of changeSet.preferencesToAppend) {
      const data = customerPreferenceMapper.toPersistence(entity);
      if (upsert)
        await transaction.customerPreference.upsert({
          where: { preferenceId: entity.properties.preferenceId.value },
          create: data,
          update: data,
        });
      else await transaction.customerPreference.create({ data });
    }
    for (const entity of changeSet.preferencesToUpdate) {
      await transaction.customerPreference.update({
        where: { preferenceId: entity.properties.preferenceId.value },
        data: customerPreferenceMapper.toPersistence(entity),
      });
    }
    // WEMP-M06-SPEC-001 §5 (D-02): append-only lifecycle ledger — never
    // updated, never deleted.
    for (const entity of changeSet.transitionsToAppend) {
      await transaction.customerStateTransition.create({
        data: customerStateTransitionMapper.toPersistence(entity),
      });
    }
    // WEMP-M06-SPEC-001 §10 (D-08): append-only business audit committed
    // atomically — never updated, never deleted.
    for (const entity of changeSet.auditRecordsToAppend) {
      await transaction.customerAuditRecord.create({
        data: customerAuditRecordMapper.toPersistence(entity),
      });
    }
  }
}
