import type { Prisma } from '../../../../../../generated/prisma/client';
import type {
  AuthenticationSecurityClassificationAssignment as AuthenticationSecurityClassificationAssignmentRecord,
  Credential as CredentialRecord,
  CredentialHistoryRecord as CredentialHistoryPersistenceRecord,
  Identity as IdentityRecord,
  IdentityIdentifier as IdentityIdentifierRecord,
  IdentityStateTransition as IdentityStateTransitionRecord,
  MfaEnrollment as MfaEnrollmentRecord,
  MfaFactor as MfaFactorRecord,
  PasswordHistoryRecord as PasswordHistoryPersistenceRecord,
  RecoveryCodeRecord as RecoveryCodePersistenceRecord,
  RecoveryCodeSet as RecoveryCodeSetRecord,
  TrustedDevice as TrustedDeviceRecord,
} from '../../../../../../generated/prisma/client';
import { AuthenticationSecurityClassificationAssignment } from '../../../../domain/identity/entities/authentication-security-classification-assignment';
import { Credential } from '../../../../domain/identity/entities/credential';
import { CredentialHistoryRecord } from '../../../../domain/identity/entities/credential-history-record';
import { IdentityIdentifier } from '../../../../domain/identity/entities/identity-identifier';
import { IdentityStateTransition } from '../../../../domain/identity/entities/identity-state-transition';
import { Identity } from '../../../../domain/identity/entities/identity';
import { MfaEnrollment } from '../../../../domain/identity/entities/mfa-enrollment';
import { MfaFactor } from '../../../../domain/identity/entities/mfa-factor';
import { PasswordHistoryRecord } from '../../../../domain/identity/entities/password-history-record';
import { RecoveryCodeRecord } from '../../../../domain/identity/entities/recovery-code-record';
import { RecoveryCodeSet } from '../../../../domain/identity/entities/recovery-code-set';
import { TrustedDevice } from '../../../../domain/identity/entities/trusted-device';
import { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../domain/shared/value-objects/correlation-identifier';
import { ProtectedValue } from '../../../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import { compactProperties } from './compact-properties';

export const identityMapper = {
  toDomain(record: IdentityRecord): Identity {
    return new Identity(
      compactProperties({
        identityId: new UuidV7(record.identityId),
        identityState: record.identityState,
        verificationState: record.verificationState,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lockedUntil: record.lockedUntil ?? undefined,
        disabledAt: record.disabledAt ?? undefined,
        anonymizedAt: record.anonymizedAt ?? undefined,
        deletionRequestedAt: record.deletionRequestedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: Identity): Prisma.IdentityUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      identityId: value.identityId.value,
      identityState: value.identityState,
      verificationState: value.verificationState,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      lockedUntil: value.lockedUntil,
      disabledAt: value.disabledAt,
      anonymizedAt: value.anonymizedAt,
      deletionRequestedAt: value.deletionRequestedAt,
    });
  },
};

export const identityIdentifierMapper = {
  toDomain(record: IdentityIdentifierRecord): IdentityIdentifier {
    return new IdentityIdentifier(
      compactProperties({
        identifierId: new UuidV7(record.identifierId),
        identityId: new UuidV7(record.identityId),
        identifierType: record.identifierType,
        protectedNormalizedValue: new ProtectedValue(record.protectedNormalizedValue),
        lookupDigest: new ProtectedValue(record.lookupDigest),
        lookupKeyVersion: record.lookupKeyVersion,
        verificationState: record.verificationState,
        isPrimary: record.isPrimary,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        verifiedAt: record.verifiedAt ?? undefined,
        retiredAt: record.retiredAt ?? undefined,
        anonymizedAt: record.anonymizedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: IdentityIdentifier): Prisma.IdentityIdentifierUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      identifierId: value.identifierId.value,
      identityId: value.identityId.value,
      identifierType: value.identifierType,
      protectedNormalizedValue: value.protectedNormalizedValue.value,
      lookupDigest: value.lookupDigest.value,
      lookupKeyVersion: value.lookupKeyVersion,
      verificationState: value.verificationState,
      isPrimary: value.isPrimary,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      verifiedAt: value.verifiedAt,
      retiredAt: value.retiredAt,
      anonymizedAt: value.anonymizedAt,
    });
  },
};

export const credentialMapper = {
  toDomain(record: CredentialRecord): Credential {
    return new Credential(
      compactProperties({
        credentialId: new UuidV7(record.credentialId),
        identityId: new UuidV7(record.identityId),
        credentialType: record.credentialType,
        credentialVersion: record.credentialVersion,
        credentialState: record.credentialState,
        protectedSecret: new ProtectedValue(record.protectedSecret),
        protectionKeyVersion: record.protectionKeyVersion ?? undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastUsedAt: record.lastUsedAt ?? undefined,
        compromisedAt: record.compromisedAt ?? undefined,
        revokedAt: record.revokedAt ?? undefined,
        replacedAt: record.replacedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: Credential): Prisma.CredentialUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      credentialId: value.credentialId.value,
      identityId: value.identityId.value,
      credentialType: value.credentialType,
      credentialVersion: value.credentialVersion,
      credentialState: value.credentialState,
      protectedSecret: value.protectedSecret.value,
      protectionKeyVersion: value.protectionKeyVersion,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      lastUsedAt: value.lastUsedAt,
      compromisedAt: value.compromisedAt,
      revokedAt: value.revokedAt,
      replacedAt: value.replacedAt,
    });
  },
};

export const credentialHistoryMapper = {
  toDomain(record: CredentialHistoryPersistenceRecord): CredentialHistoryRecord {
    return new CredentialHistoryRecord(
      compactProperties({
        credentialHistoryId: new UuidV7(record.credentialHistoryId),
        identityId: new UuidV7(record.identityId),
        credentialType: record.credentialType,
        credentialVersion: record.credentialVersion,
        protectedHistoricalValue:
          record.protectedHistoricalValue === null
            ? undefined
            : new ProtectedValue(record.protectedHistoricalValue),
        eventType: record.eventType,
        createdAt: record.createdAt,
        sourceCredentialId:
          record.sourceCredentialId === null ? undefined : new UuidV7(record.sourceCredentialId),
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(
    entity: CredentialHistoryRecord,
  ): Prisma.CredentialHistoryRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      credentialHistoryId: value.credentialHistoryId.value,
      identityId: value.identityId.value,
      credentialType: value.credentialType,
      credentialVersion: value.credentialVersion,
      protectedHistoricalValue: value.protectedHistoricalValue?.value,
      eventType: value.eventType,
      createdAt: value.createdAt,
      sourceCredentialId: value.sourceCredentialId?.value,
      correlationId: value.correlationId?.value,
    });
  },
};

export const passwordHistoryMapper = {
  toDomain(record: PasswordHistoryPersistenceRecord): PasswordHistoryRecord {
    return new PasswordHistoryRecord(
      compactProperties({
        passwordHistoryId: new UuidV7(record.passwordHistoryId),
        identityId: new UuidV7(record.identityId),
        passwordHash: new ProtectedValue(record.passwordHash),
        hashAlgorithmReference: record.hashAlgorithmReference,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(entity: PasswordHistoryRecord): Prisma.PasswordHistoryRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      passwordHistoryId: value.passwordHistoryId.value,
      identityId: value.identityId.value,
      passwordHash: value.passwordHash.value,
      hashAlgorithmReference: value.hashAlgorithmReference,
      createdAt: value.createdAt,
    });
  },
};

export const classificationAssignmentMapper = {
  toDomain(
    record: AuthenticationSecurityClassificationAssignmentRecord,
  ): AuthenticationSecurityClassificationAssignment {
    return new AuthenticationSecurityClassificationAssignment(
      compactProperties({
        classificationAssignmentId: new UuidV7(record.classificationAssignmentId),
        identityId: new UuidV7(record.identityId),
        classification: record.classification,
        effectiveAt: record.effectiveAt,
        assignmentState: record.assignmentState,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        endedAt: record.endedAt ?? undefined,
        sourceContractReference: record.sourceContractReference ?? undefined,
        reasonCode: record.reasonCode ?? undefined,
      }),
    );
  },
  toPersistence(
    entity: AuthenticationSecurityClassificationAssignment,
  ): Prisma.AuthenticationSecurityClassificationAssignmentUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      classificationAssignmentId: value.classificationAssignmentId.value,
      identityId: value.identityId.value,
      classification: value.classification,
      effectiveAt: value.effectiveAt,
      assignmentState: value.assignmentState,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      endedAt: value.endedAt,
      sourceContractReference: value.sourceContractReference,
      reasonCode: value.reasonCode,
    });
  },
};

export const mfaEnrollmentMapper = {
  toDomain(record: MfaEnrollmentRecord): MfaEnrollment {
    return new MfaEnrollment(
      compactProperties({
        mfaEnrollmentId: new UuidV7(record.mfaEnrollmentId),
        identityId: new UuidV7(record.identityId),
        enrollmentState: record.enrollmentState,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        activatedAt: record.activatedAt ?? undefined,
        disabledAt: record.disabledAt ?? undefined,
        replacementRequiredAt: record.replacementRequiredAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: MfaEnrollment): Prisma.MfaEnrollmentUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      mfaEnrollmentId: value.mfaEnrollmentId.value,
      identityId: value.identityId.value,
      enrollmentState: value.enrollmentState,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      activatedAt: value.activatedAt,
      disabledAt: value.disabledAt,
      replacementRequiredAt: value.replacementRequiredAt,
    });
  },
};

export const mfaFactorMapper = {
  toDomain(record: MfaFactorRecord): MfaFactor {
    return new MfaFactor(
      compactProperties({
        mfaFactorId: new UuidV7(record.mfaFactorId),
        mfaEnrollmentId: new UuidV7(record.mfaEnrollmentId),
        factorType: record.factorType,
        factorState: record.factorState,
        encryptedSecretOrReference: new ProtectedValue(record.encryptedSecretOrReference),
        encryptionKeyVersion: record.encryptionKeyVersion,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        verifiedAt: record.verifiedAt ?? undefined,
        lastUsedAt: record.lastUsedAt ?? undefined,
        revokedAt: record.revokedAt ?? undefined,
        replacementReason: record.replacementReason ?? undefined,
        lastAcceptedTimeStep: record.lastAcceptedTimeStep ?? undefined,
      }),
    );
  },
  toPersistence(entity: MfaFactor): Prisma.MfaFactorUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      mfaFactorId: value.mfaFactorId.value,
      mfaEnrollmentId: value.mfaEnrollmentId.value,
      factorType: value.factorType,
      factorState: value.factorState,
      encryptedSecretOrReference: value.encryptedSecretOrReference.value,
      encryptionKeyVersion: value.encryptionKeyVersion,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      verifiedAt: value.verifiedAt,
      lastUsedAt: value.lastUsedAt,
      revokedAt: value.revokedAt,
      replacementReason: value.replacementReason,
      lastAcceptedTimeStep: value.lastAcceptedTimeStep,
    });
  },
};

export const recoveryCodeSetMapper = {
  toDomain(record: RecoveryCodeSetRecord): RecoveryCodeSet {
    return new RecoveryCodeSet(
      compactProperties({
        recoveryCodeSetId: new UuidV7(record.recoveryCodeSetId),
        identityId: new UuidV7(record.identityId),
        setVersion: record.setVersion,
        setState: record.setState,
        createdAt: record.createdAt,
        invalidatedAt: record.invalidatedAt ?? undefined,
        invalidationReason: record.invalidationReason ?? undefined,
      }),
    );
  },
  toPersistence(entity: RecoveryCodeSet): Prisma.RecoveryCodeSetUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      recoveryCodeSetId: value.recoveryCodeSetId.value,
      identityId: value.identityId.value,
      setVersion: value.setVersion,
      setState: value.setState,
      createdAt: value.createdAt,
      invalidatedAt: value.invalidatedAt,
      invalidationReason: value.invalidationReason,
    });
  },
};

export const recoveryCodeMapper = {
  toDomain(record: RecoveryCodePersistenceRecord): RecoveryCodeRecord {
    return new RecoveryCodeRecord(
      compactProperties({
        recoveryCodeId: new UuidV7(record.recoveryCodeId),
        recoveryCodeSetId: new UuidV7(record.recoveryCodeSetId),
        codeDigest: new ProtectedValue(record.codeDigest),
        codeState: record.codeState,
        createdAt: record.createdAt,
        consumedAt: record.consumedAt ?? undefined,
        invalidatedAt: record.invalidatedAt ?? undefined,
      }),
    );
  },
  toPersistence(entity: RecoveryCodeRecord): Prisma.RecoveryCodeRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      recoveryCodeId: value.recoveryCodeId.value,
      recoveryCodeSetId: value.recoveryCodeSetId.value,
      codeDigest: value.codeDigest.value,
      codeState: value.codeState,
      createdAt: value.createdAt,
      consumedAt: value.consumedAt,
      invalidatedAt: value.invalidatedAt,
    });
  },
};

export const trustedDeviceMapper = {
  toDomain(record: TrustedDeviceRecord): TrustedDevice {
    return new TrustedDevice(
      compactProperties({
        trustedDeviceId: new UuidV7(record.trustedDeviceId),
        identityId: new UuidV7(record.identityId),
        protectedDeviceFingerprint: new ProtectedValue(record.protectedDeviceFingerprint),
        deviceState: record.deviceState,
        trustExpiresAt: record.trustExpiresAt,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastSeenAt: record.lastSeenAt ?? undefined,
        revokedAt: record.revokedAt ?? undefined,
        revocationReason: record.revocationReason ?? undefined,
      }),
    );
  },
  toPersistence(entity: TrustedDevice): Prisma.TrustedDeviceUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      trustedDeviceId: value.trustedDeviceId.value,
      identityId: value.identityId.value,
      protectedDeviceFingerprint: value.protectedDeviceFingerprint.value,
      deviceState: value.deviceState,
      trustExpiresAt: value.trustExpiresAt,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      lastSeenAt: value.lastSeenAt,
      revokedAt: value.revokedAt,
      revocationReason: value.revocationReason,
    });
  },
};

export const identityStateTransitionMapper = {
  toDomain(record: IdentityStateTransitionRecord): IdentityStateTransition {
    return new IdentityStateTransition(
      compactProperties({
        identityStateTransitionId: new UuidV7(record.identityStateTransitionId),
        identityId: new UuidV7(record.identityId),
        fromState: record.fromState ?? undefined,
        toState: record.toState,
        stateVersion: record.stateVersion,
        transitionedAt: record.transitionedAt,
        createdAt: record.createdAt,
        reasonCode: record.reasonCode ?? undefined,
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
    entity: IdentityStateTransition,
  ): Prisma.IdentityStateTransitionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      identityStateTransitionId: value.identityStateTransitionId.value,
      identityId: value.identityId.value,
      fromState: value.fromState,
      toState: value.toState,
      stateVersion: value.stateVersion,
      transitionedAt: value.transitionedAt,
      createdAt: value.createdAt,
      reasonCode: value.reasonCode,
      correlationId: value.correlationId?.value,
      causationId: value.causationId?.value,
      sourceReference: value.sourceReference,
    });
  },
};
