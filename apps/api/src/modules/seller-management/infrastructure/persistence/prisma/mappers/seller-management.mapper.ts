import type {
  Prisma,
  SellerAgreement as SellerAgreementRow,
  SellerBusinessAuditRecord as SellerBusinessAuditRecordRow,
  SellerBusinessVerification as SellerBusinessVerificationRow,
  SellerEvidenceLegalHold as SellerEvidenceLegalHoldRow,
  SellerIdentityAssociation as SellerIdentityAssociationRow,
  SellerOrganization as SellerOrganizationRow,
  SellerProfile as SellerProfileRow,
  SellerStateTransition as SellerStateTransitionRow,
  SellerVerificationEvidence as SellerVerificationEvidenceRow,
  SellerWarehouse as SellerWarehouseRow,
} from '../../../../../../generated/prisma/client';
import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { ProtectedValue } from '../../../../../identity-authentication/domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { compactProperties } from '../../../../../identity-authentication/infrastructure/persistence/prisma/mappers/compact-properties';
import { SellerAgreement } from '../../../../domain/entities/seller-agreement';
import { SellerBusinessAuditRecord } from '../../../../domain/entities/seller-business-audit-record';
import { SellerBusinessVerification } from '../../../../domain/entities/seller-business-verification';
import { SellerEvidenceLegalHold } from '../../../../domain/entities/seller-evidence-legal-hold';
import { SellerIdentityAssociation } from '../../../../domain/entities/seller-identity-association';
import { SellerOrganization } from '../../../../domain/entities/seller-organization';
import { SellerProfile } from '../../../../domain/entities/seller-profile';
import { SellerStateTransition } from '../../../../domain/entities/seller-state-transition';
import { SellerVerificationEvidence } from '../../../../domain/entities/seller-verification-evidence';
import { SellerWarehouse } from '../../../../domain/entities/seller-warehouse';

/**
 * WEMP-M03-PLAN-001 M03-M2 persistence mappers. The shared platform primitives
 * (UuidV7, AggregateVersion, ProtectedValue, CorrelationIdentifier) and the
 * generic compactProperties helper are reused from the identity-authentication
 * module; Module 03 never reads Module 01 or Module 02 storage. Enum columns
 * map directly because the domain unions use the identical vocabulary.
 */
export const sellerProfileMapper = {
  toDomain(record: SellerProfileRow): SellerProfile {
    return new SellerProfile(
      compactProperties({
        sellerProfileId: new UuidV7(record.sellerProfileId),
        organizationId: new UuidV7(record.organizationId),
        state: record.state,
        complianceState: record.complianceState,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        submittedAt: record.submittedAt ?? undefined,
        approvedAt: record.approvedAt ?? undefined,
        suspendedAt: record.suspendedAt ?? undefined,
        closedAt: record.closedAt ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(entity: SellerProfile): Prisma.SellerProfileUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      sellerProfileId: value.sellerProfileId.value,
      organizationId: value.organizationId.value,
      state: value.state,
      complianceState: value.complianceState,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      submittedAt: value.submittedAt,
      approvedAt: value.approvedAt,
      suspendedAt: value.suspendedAt,
      closedAt: value.closedAt,
      correlationId: value.correlationId?.value,
    });
  },
};

export const sellerOrganizationMapper = {
  toDomain(record: SellerOrganizationRow): SellerOrganization {
    return new SellerOrganization(
      compactProperties({
        organizationId: new UuidV7(record.organizationId),
        legalName: record.legalName,
        tradeName: record.tradeName,
        businessType: record.businessType ?? undefined,
        registrationNumber: new ProtectedValue(record.registrationNumber),
        registrationLookupDigest: record.registrationLookupDigest,
        businessAddress: record.businessAddress,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(entity: SellerOrganization): Prisma.SellerOrganizationUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      organizationId: value.organizationId.value,
      legalName: value.legalName,
      tradeName: value.tradeName,
      businessType: value.businessType,
      registrationNumber: value.registrationNumber.value,
      registrationLookupDigest: value.registrationLookupDigest,
      businessAddress: value.businessAddress,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const sellerIdentityAssociationMapper = {
  toDomain(record: SellerIdentityAssociationRow): SellerIdentityAssociation {
    return new SellerIdentityAssociation(
      compactProperties({
        associationId: new UuidV7(record.associationId),
        sellerProfileId: new UuidV7(record.sellerProfileId),
        identityId: new UuidV7(record.identityId),
        associationRole: record.associationRole,
        isPrimary: record.isPrimary,
        state: record.state,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        removedAt: record.removedAt ?? undefined,
      }),
    );
  },
  toPersistence(
    entity: SellerIdentityAssociation,
  ): Prisma.SellerIdentityAssociationUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      associationId: value.associationId.value,
      sellerProfileId: value.sellerProfileId.value,
      identityId: value.identityId.value,
      associationRole: value.associationRole,
      isPrimary: value.isPrimary,
      state: value.state,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      removedAt: value.removedAt,
    });
  },
};

export const sellerBusinessVerificationMapper = {
  toDomain(record: SellerBusinessVerificationRow): SellerBusinessVerification {
    return new SellerBusinessVerification(
      compactProperties({
        verificationId: new UuidV7(record.verificationId),
        sellerProfileId: new UuidV7(record.sellerProfileId),
        verificationType: record.verificationType,
        state: record.state,
        generation: record.generation,
        submittedByIdentityId: new UuidV7(record.submittedByIdentityId),
        reviewedByIdentityId:
          record.reviewedByIdentityId === null
            ? undefined
            : new UuidV7(record.reviewedByIdentityId),
        reviewedAt: record.reviewedAt ?? undefined,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(
    entity: SellerBusinessVerification,
  ): Prisma.SellerBusinessVerificationUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      verificationId: value.verificationId.value,
      sellerProfileId: value.sellerProfileId.value,
      verificationType: value.verificationType,
      state: value.state,
      generation: value.generation,
      submittedByIdentityId: value.submittedByIdentityId.value,
      reviewedByIdentityId: value.reviewedByIdentityId?.value,
      reviewedAt: value.reviewedAt,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const sellerVerificationEvidenceMapper = {
  toDomain(record: SellerVerificationEvidenceRow): SellerVerificationEvidence {
    return new SellerVerificationEvidence(
      compactProperties({
        evidenceId: new UuidV7(record.evidenceId),
        verificationId: new UuidV7(record.verificationId),
        evidenceType: record.evidenceType,
        evidenceReference: record.evidenceReference,
        evidenceDigest: record.evidenceDigest,
        uploadedByIdentityId: new UuidV7(record.uploadedByIdentityId),
        uploadedAt: record.uploadedAt,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(
    entity: SellerVerificationEvidence,
  ): Prisma.SellerVerificationEvidenceUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      evidenceId: value.evidenceId.value,
      verificationId: value.verificationId.value,
      evidenceType: value.evidenceType,
      evidenceReference: value.evidenceReference,
      evidenceDigest: value.evidenceDigest,
      uploadedByIdentityId: value.uploadedByIdentityId.value,
      uploadedAt: value.uploadedAt,
      createdAt: value.createdAt,
    });
  },
};

export const sellerWarehouseMapper = {
  toDomain(record: SellerWarehouseRow): SellerWarehouse {
    return new SellerWarehouse(
      compactProperties({
        warehouseId: new UuidV7(record.warehouseId),
        sellerProfileId: new UuidV7(record.sellerProfileId),
        name: record.name,
        address: record.address,
        state: record.state,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        closedAt: record.closedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: SellerWarehouse): Prisma.SellerWarehouseUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      warehouseId: value.warehouseId.value,
      sellerProfileId: value.sellerProfileId.value,
      name: value.name,
      address: value.address,
      state: value.state,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      closedAt: value.closedAt,
    });
  },
};

export const sellerAgreementMapper = {
  toDomain(record: SellerAgreementRow): SellerAgreement {
    return new SellerAgreement(
      compactProperties({
        agreementId: new UuidV7(record.agreementId),
        sellerProfileId: new UuidV7(record.sellerProfileId),
        agreementType: record.agreementType,
        reference: record.reference,
        state: record.state,
        effectiveFrom: record.effectiveFrom,
        effectiveTo: record.effectiveTo ?? undefined,
        signedAt: record.signedAt ?? undefined,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(entity: SellerAgreement): Prisma.SellerAgreementUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      agreementId: value.agreementId.value,
      sellerProfileId: value.sellerProfileId.value,
      agreementType: value.agreementType,
      reference: value.reference,
      state: value.state,
      effectiveFrom: value.effectiveFrom,
      effectiveTo: value.effectiveTo,
      signedAt: value.signedAt,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const sellerBusinessAuditRecordMapper = {
  toDomain(record: SellerBusinessAuditRecordRow): SellerBusinessAuditRecord {
    return new SellerBusinessAuditRecord(
      compactProperties({
        auditEventId: new UuidV7(record.auditEventId),
        sellerProfileId: new UuidV7(record.sellerProfileId),
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
  toPersistence(entity: SellerBusinessAuditRecord): Prisma.SellerBusinessAuditRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      auditEventId: value.auditEventId.value,
      sellerProfileId: value.sellerProfileId.value,
      eventType: value.eventType,
      actorIdentityId: value.actorIdentityId.value,
      occurredAt: value.occurredAt,
      createdAt: value.createdAt,
      correlationId: value.correlationId?.value,
      evidenceDigest: value.evidenceDigest,
    });
  },
};

export const sellerEvidenceLegalHoldMapper = {
  toDomain(record: SellerEvidenceLegalHoldRow): SellerEvidenceLegalHold {
    return new SellerEvidenceLegalHold(
      compactProperties({
        legalHoldId: new UuidV7(record.legalHoldId),
        sellerProfileId: new UuidV7(record.sellerProfileId),
        authorizedByIdentityId: new UuidV7(record.authorizedByIdentityId),
        reasonReference: record.reasonReference,
        active: record.active,
        placedAt: record.placedAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        releasedByIdentityId:
          record.releasedByIdentityId === null
            ? undefined
            : new UuidV7(record.releasedByIdentityId),
        releasedAt: record.releasedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: SellerEvidenceLegalHold): Prisma.SellerEvidenceLegalHoldUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      legalHoldId: value.legalHoldId.value,
      sellerProfileId: value.sellerProfileId.value,
      authorizedByIdentityId: value.authorizedByIdentityId.value,
      reasonReference: value.reasonReference,
      active: value.active,
      placedAt: value.placedAt,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      releasedByIdentityId: value.releasedByIdentityId?.value,
      releasedAt: value.releasedAt,
    });
  },
};

export const sellerStateTransitionMapper = {
  toDomain(record: SellerStateTransitionRow): SellerStateTransition {
    return new SellerStateTransition(
      compactProperties({
        sellerStateTransitionId: new UuidV7(record.sellerStateTransitionId),
        sellerProfileId: new UuidV7(record.sellerProfileId),
        fromState: record.fromState ?? undefined,
        toState: record.toState,
        stateVersion: record.stateVersion,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        actorKind: record.actorKind,
        transitionedAt: record.transitionedAt,
        createdAt: record.createdAt,
        reasonReference: record.reasonReference ?? undefined,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        causationId:
          record.causationId === null ? undefined : new UuidV7(record.causationId),
        sourceReference: record.sourceReference ?? undefined,
      }),
    );
  },
  toPersistence(entity: SellerStateTransition): Prisma.SellerStateTransitionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      sellerStateTransitionId: value.sellerStateTransitionId.value,
      sellerProfileId: value.sellerProfileId.value,
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
