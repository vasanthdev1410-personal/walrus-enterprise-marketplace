import type {
  CustomerAddress as CustomerAddressRow,
  CustomerAuditRecord as CustomerAuditRecordRow,
  CustomerBusinessProfile as CustomerBusinessProfileRow,
  CustomerPreference as CustomerPreferenceRow,
  CustomerProfile as CustomerProfileRow,
  CustomerStateTransition as CustomerStateTransitionRow,
  Prisma,
} from '../../../../../../generated/prisma/client';
import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { compactProperties } from '../../../../../identity-authentication/infrastructure/persistence/prisma/mappers/compact-properties';
import { CustomerAddress } from '../../../../domain/entities/customer-address';
import { CustomerAuditRecord } from '../../../../domain/entities/customer-audit-record';
import { CustomerBusinessProfile } from '../../../../domain/entities/customer-business-profile';
import { CustomerPreference } from '../../../../domain/entities/customer-preference';
import { CustomerProfile } from '../../../../domain/entities/customer-profile';
import { CustomerStateTransition } from '../../../../domain/entities/customer-state-transition';
import type { CustomerState } from '../../../../domain/value-objects/customer-state';

/**
 * WEMP-M06-PLAN-001 M06-M2 persistence mappers. The shared platform
 * primitives (UuidV7, AggregateVersion, CorrelationIdentifier) and the
 * generic compactProperties helper are reused from the identity-authentication
 * module; Module 06 never reads Module 01/02/03/04/05 storage (A-06).
 *
 * Enum columns map directly because the domain unions use the identical
 * vocabulary; a malformed row fails closed through the domain constructor
 * (unknown enum/state values, invalid digests, negative versions) rather
 * than producing a half-valid domain object. No credentials or
 * authentication material are ever persisted (A-04); only logical UUIDv7
 * references and approved profile/address/business/preference fields.
 */
export const customerProfileMapper = {
  toDomain(record: CustomerProfileRow): CustomerProfile {
    return new CustomerProfile(
      compactProperties({
        customerProfileId: new UuidV7(record.customerProfileId),
        identityId: new UuidV7(record.identityId),
        state: record.state,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        suspendedAt: record.suspendedAt ?? undefined,
        closedAt: record.closedAt ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(entity: CustomerProfile): Prisma.CustomerProfileUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      customerProfileId: value.customerProfileId.value,
      identityId: value.identityId.value,
      state: value.state,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      suspendedAt: value.suspendedAt,
      closedAt: value.closedAt,
      correlationId: value.correlationId?.value,
    });
  },
};

export const customerStateTransitionMapper = {
  toDomain(record: CustomerStateTransitionRow): CustomerStateTransition {
    return new CustomerStateTransition(
      compactProperties({
        transitionId: new UuidV7(record.transitionId),
        customerProfileId: new UuidV7(record.customerProfileId),
        fromState: record.fromState,
        toState: record.toState,
        stateVersion: record.stateVersion,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        actorKind: record.actorKind,
        transitionedAt: record.transitionedAt,
        createdAt: record.createdAt,
        reasonReference: record.reasonReference,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        causationId: record.causationId === null ? undefined : new UuidV7(record.causationId),
        sourceReference: record.sourceReference ?? undefined,
      }),
    );
  },
  toPersistence(
    entity: CustomerStateTransition,
  ): Prisma.CustomerStateTransitionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      transitionId: value.transitionId.value,
      customerProfileId: value.customerProfileId.value,
      fromState: value.fromState,
      toState: value.toState,
      stateVersion: value.stateVersion,
      actorIdentityId: value.actorIdentityId.value,
      actorKind: value.actorKind,
      transitionedAt: value.transitionedAt,
      createdAt: value.createdAt,
      reasonReference: value.reasonReference,
      correlationId: value.correlationId?.value,
      causationId: value.causationId?.value,
      sourceReference: value.sourceReference,
    });
  },
};

export const customerAddressMapper = {
  toDomain(record: CustomerAddressRow): CustomerAddress {
    return new CustomerAddress(
      compactProperties({
        addressId: new UuidV7(record.addressId),
        customerProfileId: new UuidV7(record.customerProfileId),
        recipientName: record.recipientName,
        line1: record.line1,
        line2: record.line2 ?? undefined,
        city: record.city,
        region: record.region ?? undefined,
        postalCode: record.postalCode,
        countryCode: record.countryCode,
        phone: record.phone ?? undefined,
        roles: record.roles,
        isDefaultShipping: record.isDefaultShipping,
        isDefaultBilling: record.isDefaultBilling,
        state: record.state,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        removedAt: record.removedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: CustomerAddress): Prisma.CustomerAddressUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      addressId: value.addressId.value,
      customerProfileId: value.customerProfileId.value,
      recipientName: value.recipientName,
      line1: value.line1,
      line2: value.line2,
      city: value.city,
      region: value.region,
      postalCode: value.postalCode,
      countryCode: value.countryCode,
      phone: value.phone,
      roles: [...value.roles],
      isDefaultShipping: value.isDefaultShipping,
      isDefaultBilling: value.isDefaultBilling,
      state: value.state,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      removedAt: value.removedAt,
    });
  },
};

export const customerBusinessProfileMapper = {
  toDomain(record: CustomerBusinessProfileRow): CustomerBusinessProfile {
    return new CustomerBusinessProfile(
      compactProperties({
        customerBusinessProfileId: new UuidV7(record.customerBusinessProfileId),
        customerProfileId: new UuidV7(record.customerProfileId),
        companyName: record.companyName,
        registrationLookupDigest: record.registrationLookupDigest ?? undefined,
        businessType: record.businessType ?? undefined,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(
    entity: CustomerBusinessProfile,
  ): Prisma.CustomerBusinessProfileUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      customerBusinessProfileId: value.customerBusinessProfileId.value,
      customerProfileId: value.customerProfileId.value,
      companyName: value.companyName,
      registrationLookupDigest: value.registrationLookupDigest,
      businessType: value.businessType,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const customerPreferenceMapper = {
  toDomain(record: CustomerPreferenceRow): CustomerPreference {
    return new CustomerPreference(
      compactProperties({
        preferenceId: new UuidV7(record.preferenceId),
        customerProfileId: new UuidV7(record.customerProfileId),
        preferenceKey: record.preferenceKey,
        preferenceValue: record.preferenceValue,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(entity: CustomerPreference): Prisma.CustomerPreferenceUncheckedCreateInput {
    const value = entity.properties;
    return {
      preferenceId: value.preferenceId.value,
      customerProfileId: value.customerProfileId.value,
      preferenceKey: value.preferenceKey,
      preferenceValue: value.preferenceValue,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  },
};

export const customerAuditRecordMapper = {
  toDomain(record: CustomerAuditRecordRow): CustomerAuditRecord {
    return new CustomerAuditRecord(
      compactProperties({
        auditEventId: new UuidV7(record.auditEventId),
        customerProfileId: new UuidV7(record.customerProfileId),
        eventType: record.eventType,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        occurredAt: record.occurredAt,
        createdAt: record.createdAt,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        evidenceDigest: record.evidenceDigest ?? undefined,
      }),
    );
  },
  toPersistence(entity: CustomerAuditRecord): Prisma.CustomerAuditRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      auditEventId: value.auditEventId.value,
      customerProfileId: value.customerProfileId.value,
      eventType: value.eventType,
      actorIdentityId: value.actorIdentityId.value,
      occurredAt: value.occurredAt,
      createdAt: value.createdAt,
      correlationId: value.correlationId?.value,
      evidenceDigest: value.evidenceDigest,
    });
  },
};

/**
 * WEMP-M06-SPEC-001 §5/§13 (D-02). Validates a persisted CustomerState enum
 * value against the approved vocabulary, failing closed on unknown values
 * (e.g. a future enum member the running domain does not know). Used by the
 * repository read paths so an unknown persisted state never reaches domain
 * logic.
 */
export function assertKnownCustomerState(state: CustomerState): void {
  if (!['ACTIVE', 'SUSPENDED', 'CLOSED'].includes(state)) {
    throw new Error('Unknown customer state in persistence record');
  }
}
