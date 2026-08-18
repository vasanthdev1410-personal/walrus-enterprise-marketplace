import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CustomerAddress } from '../entities/customer-address';
import type { CustomerAuditRecord } from '../entities/customer-audit-record';
import type { CustomerBusinessProfile } from '../entities/customer-business-profile';
import type { CustomerPreference } from '../entities/customer-preference';
import type { CustomerProfile } from '../entities/customer-profile';
import type { CustomerStateTransition } from '../entities/customer-state-transition';

/**
 * WEMP-M06-PLAN-001 M06-M2. Module 06-owned customer aggregate repository.
 * All mutations are atomic change sets guarded by the aggregate version; a
 * stale version throws an optimistic-concurrency error without mutating any
 * state. Cross-module references (identityId, actorIdentityId) are logical
 * UUIDv7 values — the repository never reads Module 01 or Module 02 storage.
 * Port-only in M06-M1; the persistence adapter is implemented in M06-M2.
 */
export interface CustomerProfileRepository {
  findById(customerProfileId: UuidV7): Promise<CustomerProfile | null>;
  findByIdentityId(identityId: UuidV7): Promise<CustomerProfile | null>;
  findAddresses(customerProfileId: UuidV7): Promise<readonly CustomerAddress[]>;
  findBusinessProfile(customerProfileId: UuidV7): Promise<CustomerBusinessProfile | null>;
  findPreferences(customerProfileId: UuidV7): Promise<readonly CustomerPreference[]>;
  findTransitions(customerProfileId: UuidV7): Promise<readonly CustomerStateTransition[]>;
  findAuditRecords(customerProfileId: UuidV7): Promise<readonly CustomerAuditRecord[]>;
  insert(changeSet: CustomerAggregateChangeSet): Promise<void>;
  save(changeSet: CustomerAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
}

export interface CustomerAggregateChangeSet {
  readonly customerProfile: CustomerProfile;
  readonly addressesToAppend: readonly CustomerAddress[];
  readonly addressesToUpdate: readonly CustomerAddress[];
  readonly businessProfile?: CustomerBusinessProfile;
  readonly preferencesToAppend: readonly CustomerPreference[];
  readonly preferencesToUpdate: readonly CustomerPreference[];
  /**
   * WEMP-M06-SPEC-001 §10 / decision D-08. Append-only Module 06 business
   * audit events committed atomically with the mutation that caused them.
   * Every lifecycle transition and address/business/preference action is
   * audited.
   */
  readonly transitionsToAppend: readonly CustomerStateTransition[];
  readonly auditRecordsToAppend: readonly CustomerAuditRecord[];
}
