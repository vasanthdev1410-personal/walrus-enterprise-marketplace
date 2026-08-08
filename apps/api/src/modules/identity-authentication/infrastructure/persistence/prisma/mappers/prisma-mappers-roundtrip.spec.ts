import type {
  AuthenticationSecurityClassificationAssignment as ClassificationAssignmentRecord,
  Credential as CredentialRecord,
  CredentialHistoryRecord as CredentialHistoryRecordRecord,
  Identity as IdentityRecord,
  IdentityIdentifier as IdentityIdentifierRecord,
  IdentityStateTransition as IdentityStateTransitionRecord,
  MfaEnrollment as MfaEnrollmentRecord,
  MfaFactor as MfaFactorRecord,
  OtpEvidenceRecord as OtpEvidenceRecordRecord,
  PasswordHistoryRecord as PasswordHistoryRecordRecord,
  RecoveryApprovalRecord as RecoveryApprovalRecordRecord,
  RecoveryAttempt as RecoveryAttemptRecord,
  RecoveryCodeRecord as RecoveryCodeRecordRecord,
  RecoveryCodeSet as RecoveryCodeSetRecord,
  RecoveryEvidenceRecord as RecoveryEvidenceRecordRecord,
  RecoveryNotificationRecord as RecoveryNotificationRecordRecord,
  RecoveryRequest as RecoveryRequestRecord,
  RecoveryStateTransition as RecoveryStateTransitionRecord,
  RefreshTokenFamily as RefreshTokenFamilyRecord,
  RefreshTokenRecord as RefreshTokenRecordRecord,
  Session as SessionRecord,
  TrustedDevice as TrustedDeviceRecord,
  VerificationAttempt as VerificationAttemptRecord,
  VerificationChallenge as VerificationChallengeRecord,
} from '../../../../../../generated/prisma/client';
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
} from './identity.mapper';
import {
  recoveryApprovalMapper,
  recoveryAttemptMapper,
  recoveryEvidenceMapper,
  recoveryNotificationMapper,
  recoveryRequestMapper,
  recoveryStateTransitionMapper,
} from './recovery.mapper';
import { refreshTokenFamilyMapper, refreshTokenMapper, sessionMapper } from './session.mapper';
import {
  otpEvidenceMapper,
  verificationAttemptMapper,
  verificationChallengeMapper,
} from './verification.mapper';

const identityId = '018f22e2-79b0-7cc3-8c5e-000000000001';
const recordId = '018f22e2-79b0-7cc3-8c5e-000000000002';
const recordId3 = '018f22e2-79b0-7cc3-8c5e-000000000003';
const createdAt = new Date('2026-08-05T00:00:00.000Z');
const updatedAt = new Date('2026-08-05T00:01:00.000Z');
const later = new Date('2026-08-05T01:00:00.000Z');

describe('Prisma Domain mappers - Identity', () => {
  it('round-trips the Identity record with and without optional dates', () => {
    const withNulls: IdentityRecord = {
      identityId,
      identityState: 'ACTIVE',
      verificationState: 'VERIFIED',
      aggregateVersion: 2,
      createdAt,
      updatedAt,
      lockedUntil: null,
      disabledAt: null,
      anonymizedAt: null,
      deletionRequestedAt: null,
    };
    const domainWithNulls = identityMapper.toDomain(withNulls);
    expect(domainWithNulls.properties.lockedUntil).toBeUndefined();
    expect(identityMapper.toPersistence(domainWithNulls)).not.toHaveProperty('lockedUntil');

    const withValues: IdentityRecord = {
      ...withNulls,
      lockedUntil: later,
      disabledAt: updatedAt,
      anonymizedAt: updatedAt,
      deletionRequestedAt: updatedAt,
    };
    const domainWithValues = identityMapper.toDomain(withValues);
    expect(domainWithValues.properties.lockedUntil).toEqual(later);
    expect(identityMapper.toPersistence(domainWithValues)).toMatchObject({
      lockedUntil: later,
      disabledAt: updatedAt,
    });
  });

  it('round-trips the IdentityIdentifier record', () => {
    const withNulls: IdentityIdentifierRecord = {
      identifierId: recordId,
      identityId,
      identifierType: 'EMAIL',
      protectedNormalizedValue: 'protected',
      lookupDigest: 'digest',
      lookupKeyVersion: 'v1',
      verificationState: 'UNVERIFIED',
      isPrimary: true,
      createdAt,
      updatedAt,
      verifiedAt: null,
      retiredAt: null,
      anonymizedAt: null,
    };
    const domainWithNulls = identityIdentifierMapper.toDomain(withNulls);
    expect(domainWithNulls.properties.verifiedAt).toBeUndefined();
    expect(identityIdentifierMapper.toPersistence(domainWithNulls)).not.toHaveProperty(
      'verifiedAt',
    );

    const withValues: IdentityIdentifierRecord = {
      ...withNulls,
      verificationState: 'VERIFIED',
      verifiedAt: createdAt,
      retiredAt: later,
      anonymizedAt: updatedAt,
    };
    const domainWithValues = identityIdentifierMapper.toDomain(withValues);
    expect(domainWithValues.properties.verifiedAt).toEqual(createdAt);
    expect(identityIdentifierMapper.toPersistence(domainWithValues)).toMatchObject({
      retiredAt: later,
      anonymizedAt: updatedAt,
    });
  });

  it('round-trips the Credential record across states', () => {
    const base: CredentialRecord = {
      credentialId: recordId,
      identityId,
      credentialType: 'PASSWORD',
      credentialVersion: 1,
      credentialState: 'CREATED',
      protectedSecret: 'hash',
      protectionKeyVersion: null,
      createdAt,
      updatedAt,
      lastUsedAt: null,
      compromisedAt: null,
      revokedAt: null,
      replacedAt: null,
    };
    const domainCreated = credentialMapper.toDomain(base);
    expect(domainCreated.properties.protectionKeyVersion).toBeUndefined();
    expect(credentialMapper.toPersistence(domainCreated)).not.toHaveProperty('lastUsedAt');

    const replaced: CredentialRecord = {
      ...base,
      credentialState: 'REPLACED',
      protectionKeyVersion: 'k1',
      lastUsedAt: updatedAt,
      replacedAt: later,
    };
    const domainReplaced = credentialMapper.toDomain(replaced);
    expect(domainReplaced.properties.replacedAt).toEqual(later);
    expect(credentialMapper.toPersistence(domainReplaced)).toMatchObject({
      protectionKeyVersion: 'k1',
      lastUsedAt: updatedAt,
      replacedAt: later,
    });

    const compromised: CredentialRecord = {
      ...base,
      credentialState: 'COMPROMISED',
      compromisedAt: later,
    };
    expect(credentialMapper.toDomain(compromised).properties.compromisedAt).toEqual(later);

    const revoked: CredentialRecord = { ...base, credentialState: 'REVOKED', revokedAt: later };
    expect(credentialMapper.toDomain(revoked).properties.revokedAt).toEqual(later);
  });

  it('round-trips the CredentialHistoryRecord and PasswordHistoryRecord', () => {
    const historyWithNulls: CredentialHistoryRecordRecord = {
      credentialHistoryId: recordId,
      identityId,
      credentialType: 'PASSWORD',
      credentialVersion: 1,
      protectedHistoricalValue: null,
      eventType: 'CREATED',
      createdAt,
      sourceCredentialId: null,
      correlationId: null,
    };
    const domainHistory = credentialHistoryMapper.toDomain(historyWithNulls);
    expect(domainHistory.properties.protectedHistoricalValue).toBeUndefined();
    expect(credentialHistoryMapper.toPersistence(domainHistory)).not.toHaveProperty(
      'correlationId',
    );

    const historyWithValues: CredentialHistoryRecordRecord = {
      ...historyWithNulls,
      protectedHistoricalValue: 'protected-value',
      sourceCredentialId: recordId3,
      correlationId: recordId,
    };
    const domainHistoryValues = credentialHistoryMapper.toDomain(historyWithValues);
    expect(domainHistoryValues.properties.sourceCredentialId?.value).toBe(recordId3);
    expect(credentialHistoryMapper.toPersistence(domainHistoryValues)).toMatchObject({
      protectedHistoricalValue: 'protected-value',
      sourceCredentialId: recordId3,
      correlationId: recordId,
    });

    const passwordRecord: PasswordHistoryRecordRecord = {
      passwordHistoryId: recordId,
      identityId,
      passwordHash: 'hash',
      hashAlgorithmReference: 'argon2id-v19',
      createdAt,
    };
    expect(passwordHistoryMapper.toDomain(passwordRecord).properties.hashAlgorithmReference).toBe(
      'argon2id-v19',
    );
    expect(
      passwordHistoryMapper.toPersistence(passwordHistoryMapper.toDomain(passwordRecord)),
    ).toEqual({
      passwordHistoryId: recordId,
      identityId,
      passwordHash: 'hash',
      hashAlgorithmReference: 'argon2id-v19',
      createdAt,
    });
  });

  it('round-trips the classification assignment, MFA, recovery-code and trusted-device records', () => {
    const assignment: ClassificationAssignmentRecord = {
      classificationAssignmentId: recordId,
      identityId,
      classification: 'STANDARD_AUTHENTICATION',
      effectiveAt: createdAt,
      assignmentState: 'EFFECTIVE',
      aggregateVersion: 1,
      createdAt,
      updatedAt,
      endedAt: null,
      sourceContractReference: null,
      reasonCode: null,
    };
    expect(classificationAssignmentMapper.toDomain(assignment).properties.endedAt).toBeUndefined();
    expect(
      classificationAssignmentMapper.toPersistence(
        classificationAssignmentMapper.toDomain(assignment),
      ),
    ).not.toHaveProperty('endedAt');

    const enrollment: MfaEnrollmentRecord = {
      mfaEnrollmentId: recordId,
      identityId,
      enrollmentState: 'ACTIVE',
      createdAt,
      updatedAt,
      activatedAt: createdAt,
      disabledAt: null,
      replacementRequiredAt: null,
    };
    expect(mfaEnrollmentMapper.toDomain(enrollment).properties.activatedAt).toEqual(createdAt);
    expect(
      mfaEnrollmentMapper.toPersistence(mfaEnrollmentMapper.toDomain(enrollment)),
    ).toMatchObject({
      activatedAt: createdAt,
    });

    const factor: MfaFactorRecord = {
      mfaFactorId: recordId,
      mfaEnrollmentId: recordId3,
      factorType: 'TOTP_AUTHENTICATOR',
      factorState: 'ACTIVE',
      encryptedSecretOrReference: 'encrypted',
      encryptionKeyVersion: 'v1',
      createdAt,
      updatedAt,
      verifiedAt: createdAt,
      lastUsedAt: updatedAt,
      revokedAt: null,
      replacementReason: null,
      lastAcceptedTimeStep: 123n,
    };
    expect(mfaFactorMapper.toDomain(factor).properties.lastAcceptedTimeStep).toBe(123n);
    expect(mfaFactorMapper.toPersistence(mfaFactorMapper.toDomain(factor))).toMatchObject({
      lastAcceptedTimeStep: 123n,
      lastUsedAt: updatedAt,
    });

    const codeSet: RecoveryCodeSetRecord = {
      recoveryCodeSetId: recordId,
      identityId,
      setVersion: 1,
      setState: 'ACTIVE',
      createdAt,
      invalidatedAt: null,
      invalidationReason: null,
    };
    expect(recoveryCodeSetMapper.toDomain(codeSet).properties.invalidatedAt).toBeUndefined();
    expect(
      recoveryCodeSetMapper.toPersistence(recoveryCodeSetMapper.toDomain(codeSet)),
    ).not.toHaveProperty('invalidatedAt');

    const code: RecoveryCodeRecordRecord = {
      recoveryCodeId: recordId,
      recoveryCodeSetId: recordId3,
      codeDigest: 'digest',
      codeState: 'CONSUMED',
      createdAt,
      consumedAt: createdAt,
      invalidatedAt: null,
    };
    expect(recoveryCodeMapper.toDomain(code).properties.consumedAt).toEqual(createdAt);
    expect(recoveryCodeMapper.toPersistence(recoveryCodeMapper.toDomain(code))).toMatchObject({
      consumedAt: createdAt,
    });

    const device: TrustedDeviceRecord = {
      trustedDeviceId: recordId,
      identityId,
      protectedDeviceFingerprint: 'fingerprint',
      deviceState: 'REVOKED',
      trustExpiresAt: later,
      aggregateVersion: 1,
      createdAt,
      updatedAt,
      lastSeenAt: updatedAt,
      revokedAt: later,
      revocationReason: 'compromised',
    };
    expect(trustedDeviceMapper.toDomain(device).properties.revokedAt).toEqual(later);
    expect(trustedDeviceMapper.toPersistence(trustedDeviceMapper.toDomain(device))).toMatchObject({
      lastSeenAt: updatedAt,
      revocationReason: 'compromised',
    });
  });

  it('round-trips the IdentityStateTransition record with optional origin metadata', () => {
    const withNulls: IdentityStateTransitionRecord = {
      identityStateTransitionId: recordId,
      identityId,
      fromState: null,
      toState: 'PENDING_VERIFICATION',
      stateVersion: 1,
      transitionedAt: createdAt,
      createdAt,
      reasonCode: null,
      correlationId: null,
      causationId: null,
      sourceReference: null,
    };
    const domainWithNulls = identityStateTransitionMapper.toDomain(withNulls);
    expect(domainWithNulls.properties.fromState).toBeUndefined();
    expect(identityStateTransitionMapper.toPersistence(domainWithNulls)).not.toHaveProperty(
      'causationId',
    );

    const withValues: IdentityStateTransitionRecord = {
      ...withNulls,
      fromState: 'PENDING_VERIFICATION',
      toState: 'ACTIVE',
      stateVersion: 2,
      reasonCode: 'activated',
      correlationId: recordId,
      causationId: recordId3,
      sourceReference: 'registration',
    };
    const domainWithValues = identityStateTransitionMapper.toDomain(withValues);
    expect(domainWithValues.properties.causationId?.value).toBe(recordId3);
    expect(identityStateTransitionMapper.toPersistence(domainWithValues)).toMatchObject({
      reasonCode: 'activated',
      correlationId: recordId,
      causationId: recordId3,
      sourceReference: 'registration',
    });
  });
});

describe('Prisma Domain mappers - Recovery', () => {
  it('round-trips the RecoveryRequest record with optional lifecycle fields', () => {
    const base: RecoveryRequestRecord = {
      recoveryRequestId: recordId,
      identityId,
      operationClass: 'PASSWORD_RESET',
      recoveryState: 'REQUESTED',
      recoveryAssurance: 'RA0',
      recoveryPolicyVersion: 'v1',
      permittedOperation: 'PASSWORD_RESET',
      stateVersion: 1,
      expiresAt: later,
      aggregateVersion: 1,
      createdAt,
      updatedAt,
      approvedAt: null,
      executionStartedAt: null,
      completedAt: null,
      terminalReason: null,
      idempotencyKey: null,
      correlationId: null,
    };
    const domainBase = recoveryRequestMapper.toDomain(base);
    expect(domainBase.properties.approvedAt).toBeUndefined();
    expect(recoveryRequestMapper.toPersistence(domainBase)).not.toHaveProperty('idempotencyKey');

    const withValues: RecoveryRequestRecord = {
      ...base,
      recoveryState: 'APPROVED',
      approvedAt: createdAt,
      executionStartedAt: updatedAt,
      completedAt: later,
      terminalReason: 'done',
      idempotencyKey: 'idem-1',
      correlationId: recordId,
    };
    const domainWithValues = recoveryRequestMapper.toDomain(withValues);
    expect(domainWithValues.properties.correlationId?.value).toBe(recordId);
    expect(recoveryRequestMapper.toPersistence(domainWithValues)).toMatchObject({
      approvedAt: createdAt,
      terminalReason: 'done',
      idempotencyKey: 'idem-1',
    });
  });

  it('round-trips the recovery evidence, approval, attempt, transition and notification records', () => {
    const evidence: RecoveryEvidenceRecordRecord = {
      recoveryEvidenceId: recordId,
      recoveryRequestId: recordId3,
      evidenceType: 'VERIFIED_EMAIL_CHANNEL',
      protectedEvidenceOrReference: 'protected',
      evidenceState: 'VERIFIED',
      evidenceBoundary: 'EMAIL_CHANNEL',
      expiresAt: later,
      createdAt,
      verifiedAt: createdAt,
      consumedAt: null,
      failureReason: null,
    };
    expect(recoveryEvidenceMapper.toDomain(evidence).properties.verifiedAt).toEqual(createdAt);
    expect(
      recoveryEvidenceMapper.toPersistence(recoveryEvidenceMapper.toDomain(evidence)),
    ).toMatchObject({
      protectedEvidenceOrReference: 'protected',
    });

    const approval: RecoveryApprovalRecordRecord = {
      recoveryApprovalId: recordId,
      recoveryRequestId: recordId3,
      recoveredIdentityId: identityId,
      operationClass: 'PASSWORD_RESET',
      approverIdentityId: recordId3,
      authorizationEvidenceReference: 'evidence',
      decision: 'APPROVED',
      decidedAt: createdAt,
      expiresAt: later,
      createdAt,
    };
    expect(recoveryApprovalMapper.toDomain(approval).properties.decision).toBe('APPROVED');
    expect(
      recoveryApprovalMapper.toPersistence(recoveryApprovalMapper.toDomain(approval)),
    ).toMatchObject({
      authorizationEvidenceReference: 'evidence',
      operationClass: 'PASSWORD_RESET',
    });

    const attempt: RecoveryAttemptRecord = {
      recoveryAttemptId: recordId,
      recoveryRequestId: recordId3,
      attemptType: 'EVIDENCE_SUBMISSION',
      outcome: 'SUCCEEDED',
      attemptedAt: createdAt,
      createdAt,
      failureReason: null,
      sourceIpReference: 'protected-ip',
      deviceReference: null,
    };
    const domainAttempt = recoveryAttemptMapper.toDomain(attempt);
    expect(domainAttempt.properties.protectedSourceIpReference?.value).toBe('protected-ip');
    expect(recoveryAttemptMapper.toPersistence(domainAttempt)).toMatchObject({
      sourceIpReference: 'protected-ip',
    });

    const transition: RecoveryStateTransitionRecord = {
      recoveryTransitionId: recordId,
      recoveryRequestId: recordId3,
      fromState: 'REQUESTED',
      toState: 'EVIDENCE_PENDING',
      stateVersion: 1,
      transitionedAt: createdAt,
      createdAt,
      actorIdentityId: identityId,
      reasonCode: 'submitted',
      correlationId: recordId,
    };
    expect(
      recoveryStateTransitionMapper.toDomain(transition).properties.actorIdentityId?.value,
    ).toBe(identityId);
    expect(
      recoveryStateTransitionMapper.toPersistence(
        recoveryStateTransitionMapper.toDomain(transition),
      ),
    ).toMatchObject({
      recoveryTransitionId: recordId,
      reasonCode: 'submitted',
    });

    const notification: RecoveryNotificationRecordRecord = {
      recoveryNotificationId: recordId,
      recoveryRequestId: recordId3,
      notificationType: 'RECOVERY_REQUEST_INITIATED',
      deliveryState: 'DELIVERED',
      destinationReference: 'destination',
      createdAt,
      deliveredAt: createdAt,
      failedAt: null,
      failureReason: null,
    };
    expect(recoveryNotificationMapper.toDomain(notification).properties.deliveredAt).toEqual(
      createdAt,
    );
    expect(
      recoveryNotificationMapper.toPersistence(recoveryNotificationMapper.toDomain(notification)),
    ).toMatchObject({
      destinationReference: 'destination',
    });
  });
});

describe('Prisma Domain mappers - Session', () => {
  it('round-trips the Session record with optional authentication metadata', () => {
    const base: SessionRecord = {
      sessionId: recordId,
      identityId,
      sessionClass: 'INTERACTIVE_WEB',
      sessionState: 'ACTIVE',
      sessionVersion: 1,
      authenticationAssurance: 'AAL1',
      authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
      authenticationMethods: ['PASSWORD'],
      createdAt,
      lastActivityAt: createdAt,
      idleExpiresAt: later,
      absoluteExpiresAt: later,
      aggregateVersion: 1,
      revokedAt: null,
      revocationReason: null,
      deviceSessionId: null,
      mfaVerifiedAt: null,
      correlationId: null,
    };
    const domainBase = sessionMapper.toDomain(base);
    expect(domainBase.properties.deviceSessionId).toBeUndefined();
    expect(sessionMapper.toPersistence(domainBase)).not.toHaveProperty('mfaVerifiedAt');

    const withValues: SessionRecord = {
      ...base,
      sessionState: 'REVOKED',
      revokedAt: later,
      revocationReason: 'expired',
      deviceSessionId: recordId3,
      mfaVerifiedAt: updatedAt,
      correlationId: recordId,
    };
    const domainWithValues = sessionMapper.toDomain(withValues);
    expect(domainWithValues.properties.deviceSessionId?.value).toBe(recordId3);
    expect(sessionMapper.toPersistence(domainWithValues)).toMatchObject({
      revokedAt: later,
      revocationReason: 'expired',
      deviceSessionId: recordId3,
      mfaVerifiedAt: updatedAt,
      correlationId: recordId,
    });
  });

  it('round-trips the refresh token family and record', () => {
    const family: RefreshTokenFamilyRecord = {
      tokenFamilyId: recordId,
      sessionId: recordId3,
      familyState: 'REVOKED',
      aggregateVersion: 1,
      createdAt,
      revokedAt: later,
      revocationReason: 'compromised',
      reuseDetectedAt: createdAt,
    };
    expect(refreshTokenFamilyMapper.toDomain(family).properties.revokedAt).toEqual(later);
    expect(
      refreshTokenFamilyMapper.toPersistence(refreshTokenFamilyMapper.toDomain(family)),
    ).toMatchObject({
      reuseDetectedAt: createdAt,
    });

    const token: RefreshTokenRecordRecord = {
      refreshTokenId: recordId,
      tokenFamilyId: recordId3,
      tokenDigest: 'digest',
      tokenState: 'USED',
      issuedAt: createdAt,
      expiresAt: later,
      createdAt,
      consumedAt: createdAt,
      revokedAt: null,
      successorTokenId: recordId3,
      parentTokenId: null,
      reuseDetectedAt: null,
    };
    const domainToken = refreshTokenMapper.toDomain(token);
    expect(domainToken.properties.successorTokenId?.value).toBe(recordId3);
    expect(refreshTokenMapper.toPersistence(domainToken)).toMatchObject({
      successorTokenId: recordId3,
      consumedAt: createdAt,
    });
  });
});

describe('Prisma Domain mappers - Verification', () => {
  it('round-trips the VerificationChallenge record with optional fields', () => {
    const base: VerificationChallengeRecord = {
      challengeId: recordId,
      identityId: null,
      purpose: 'REGISTRATION_VERIFICATION',
      channelType: 'EMAIL',
      protectedDestinationReference: 'destination',
      challengeDigest: 'digest',
      challengeState: 'CREATED',
      attemptCount: 0,
      maximumAttempts: 5,
      expiresAt: later,
      aggregateVersion: 1,
      createdAt,
      updatedAt,
      consumedAt: null,
      cancelledAt: null,
      correlationId: null,
    };
    const domainBase = verificationChallengeMapper.toDomain(base);
    expect(domainBase.properties.identityId).toBeUndefined();
    expect(verificationChallengeMapper.toPersistence(domainBase)).not.toHaveProperty('consumedAt');

    const withValues: VerificationChallengeRecord = {
      ...base,
      identityId,
      challengeState: 'CANCELLED',
      consumedAt: createdAt,
      cancelledAt: later,
      correlationId: recordId,
    };
    const domainWithValues = verificationChallengeMapper.toDomain(withValues);
    expect(domainWithValues.properties.identityId?.value).toBe(identityId);
    expect(verificationChallengeMapper.toPersistence(domainWithValues)).toMatchObject({
      consumedAt: createdAt,
      cancelledAt: later,
      correlationId: recordId,
    });
  });

  it('round-trips the VerificationAttempt and OTP evidence records', () => {
    const attempt: VerificationAttemptRecord = {
      verificationAttemptId: recordId,
      challengeId: recordId3,
      outcome: 'SUCCEEDED',
      attemptedAt: createdAt,
      createdAt,
      sourceIpReference: 'protected-ip',
      deviceReference: null,
      failureReason: null,
    };
    const domainAttempt = verificationAttemptMapper.toDomain(attempt);
    expect(domainAttempt.properties.sourceIpReference?.value).toBe('protected-ip');
    expect(verificationAttemptMapper.toPersistence(domainAttempt)).toMatchObject({
      sourceIpReference: 'protected-ip',
    });

    const evidence: OtpEvidenceRecordRecord = {
      otpEvidenceId: recordId,
      challengeId: recordId3,
      evidenceDigest: 'digest',
      evidenceState: 'CONSUMED',
      expiresAt: later,
      createdAt,
      consumedAt: createdAt,
    };
    expect(otpEvidenceMapper.toDomain(evidence).properties.consumedAt).toEqual(createdAt);
    expect(otpEvidenceMapper.toPersistence(otpEvidenceMapper.toDomain(evidence))).toMatchObject({
      consumedAt: createdAt,
    });
  });
});
