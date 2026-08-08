import { AggregateVersion } from './shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from './shared/value-objects/correlation-identifier';
import { ProtectedValue } from './shared/value-objects/protected-value';
import { UuidV7 } from './shared/value-objects/uuid-v7';
import { RefreshTokenDigest } from './session/value-objects/refresh-token-digest';
import { SessionVersion } from './session/value-objects/session-version';
import { PermittedRecoveryOperation } from './recovery/value-objects/permitted-recovery-operation';
import { RecoveryPolicyVersion } from './recovery/value-objects/recovery-policy-version';
import { RecoveryApprovalRecord } from './recovery/entities/recovery-approval-record';
import { RecoveryAttempt } from './recovery/entities/recovery-attempt';
import { RecoveryEvidenceRecord } from './recovery/entities/recovery-evidence-record';
import { RecoveryNotificationRecord } from './recovery/entities/recovery-notification-record';
import { RecoveryRequest } from './recovery/entities/recovery-request';
import { RecoveryStateTransition } from './recovery/entities/recovery-state-transition';
import { Session } from './session/entities/session';
import { RefreshTokenFamily } from './session/entities/refresh-token-family';
import { RefreshTokenRecord } from './session/entities/refresh-token-record';
import { VerificationChallenge } from './verification/entities/verification-challenge';
import { VerificationAttempt } from './verification/entities/verification-attempt';
import { OtpEvidenceRecord } from './verification/entities/otp-evidence-record';
import { Identity } from './identity/entities/identity';
import { IdentityIdentifier } from './identity/entities/identity-identifier';
import { Credential } from './identity/entities/credential';
import { MfaEnrollment } from './identity/entities/mfa-enrollment';
import { MfaFactor } from './identity/entities/mfa-factor';
import { PasswordHistoryRecord } from './identity/entities/password-history-record';
import { CredentialHistoryRecord } from './identity/entities/credential-history-record';
import { AuthenticationSecurityClassificationAssignment } from './identity/entities/authentication-security-classification-assignment';
import { IdentityStateTransition } from './identity/entities/identity-state-transition';
import { RecoveryCodeRecord } from './identity/entities/recovery-code-record';
import { RecoveryCodeSet } from './identity/entities/recovery-code-set';
import { TrustedDevice } from './identity/entities/trusted-device';

const uuid = (suffix: string): UuidV7 => new UuidV7(`018f22e2-79b0-7cc3-8c5e-${suffix}`);
const protectedValue = (value: string): ProtectedValue => new ProtectedValue(value);
const createdAt = new Date('2026-08-05T00:00:00.000Z');
const oneHourLater = new Date('2026-08-05T01:00:00.000Z');
const oneHourBefore = new Date('2026-08-04T23:00:00.000Z');

describe('Module 01 domain entities - Identity', () => {
  it('constructs a valid Identity and rejects backdated updates', () => {
    const identity = new Identity({
      identityId: uuid('000000000001'),
      identityState: 'PENDING_VERIFICATION',
      verificationState: 'PENDING_VERIFICATION',
      aggregateVersion: new AggregateVersion(1),
      createdAt,
      updatedAt: createdAt,
    });

    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.properties)).toBe(true);
    expect(
      () =>
        new Identity({
          identityId: uuid('000000000001'),
          identityState: 'PENDING_VERIFICATION',
          verificationState: 'PENDING_VERIFICATION',
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: oneHourBefore,
        }),
    ).toThrow('Identity updatedAt cannot precede createdAt');
  });

  it('constructs a valid IdentityIdentifier and enforces its invariants', () => {
    const identifier = new IdentityIdentifier({
      identifierId: uuid('000000000002'),
      identityId: uuid('000000000001'),
      identifierType: 'EMAIL',
      protectedNormalizedValue: protectedValue('user@example.com'),
      lookupDigest: protectedValue('digest'),
      lookupKeyVersion: 'v1',
      verificationState: 'VERIFIED',
      isPrimary: true,
      createdAt,
      updatedAt: createdAt,
      verifiedAt: createdAt,
    });

    expect(identifier.properties.lookupKeyVersion).toBe('v1');
    expect(
      () =>
        new IdentityIdentifier({
          identifierId: uuid('000000000002'),
          identityId: uuid('000000000001'),
          identifierType: 'EMAIL',
          protectedNormalizedValue: protectedValue('user@example.com'),
          lookupDigest: protectedValue('digest'),
          lookupKeyVersion: '',
          verificationState: 'UNVERIFIED',
          isPrimary: true,
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Identifier lookup key version cannot be empty');
    expect(
      () =>
        new IdentityIdentifier({
          identifierId: uuid('000000000002'),
          identityId: uuid('000000000001'),
          identifierType: 'EMAIL',
          protectedNormalizedValue: protectedValue('user@example.com'),
          lookupDigest: protectedValue('digest'),
          lookupKeyVersion: 'v1',
          verificationState: 'VERIFIED',
          isPrimary: true,
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Verified identifier requires verifiedAt');
  });

  it('constructs a valid Credential and enforces its state invariants', () => {
    const credential = new Credential({
      credentialId: uuid('000000000003'),
      identityId: uuid('000000000001'),
      credentialType: 'PASSWORD',
      credentialVersion: 1,
      credentialState: 'ACTIVE',
      protectedSecret: protectedValue('hash'),
      createdAt,
      updatedAt: createdAt,
    });

    expect(credential.properties.credentialState).toBe('ACTIVE');
    expect(
      () =>
        new Credential({
          credentialId: uuid('000000000003'),
          identityId: uuid('000000000001'),
          credentialType: 'PASSWORD',
          credentialVersion: 0,
          credentialState: 'ACTIVE',
          protectedSecret: protectedValue('hash'),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Credential version must be a positive safe integer');
    expect(
      () =>
        new Credential({
          credentialId: uuid('000000000003'),
          identityId: uuid('000000000001'),
          credentialType: 'PASSWORD',
          credentialVersion: 1,
          credentialState: 'COMPROMISED',
          protectedSecret: protectedValue('hash'),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Compromised Credential requires compromisedAt');
    expect(
      () =>
        new Credential({
          credentialId: uuid('000000000003'),
          identityId: uuid('000000000001'),
          credentialType: 'PASSWORD',
          credentialVersion: 1,
          credentialState: 'REVOKED',
          protectedSecret: protectedValue('hash'),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Revoked Credential requires revokedAt');
    expect(
      () =>
        new Credential({
          credentialId: uuid('000000000003'),
          identityId: uuid('000000000001'),
          credentialType: 'PASSWORD',
          credentialVersion: 1,
          credentialState: 'REPLACED',
          protectedSecret: protectedValue('hash'),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Replaced Credential requires replacedAt');
  });

  it('constructs valid MFA enrollment and factor records', () => {
    const enrollment = new MfaEnrollment({
      mfaEnrollmentId: uuid('000000000004'),
      identityId: uuid('000000000001'),
      enrollmentState: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
      activatedAt: createdAt,
    });

    expect(enrollment.properties.enrollmentState).toBe('ACTIVE');
    expect(
      () =>
        new MfaEnrollment({
          mfaEnrollmentId: uuid('000000000004'),
          identityId: uuid('000000000001'),
          enrollmentState: 'ACTIVE',
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Active MFA enrollment requires activatedAt');

    const factor = new MfaFactor({
      mfaFactorId: uuid('000000000005'),
      mfaEnrollmentId: uuid('000000000004'),
      factorType: 'TOTP_AUTHENTICATOR',
      factorState: 'ACTIVE',
      encryptedSecretOrReference: protectedValue('encrypted'),
      encryptionKeyVersion: 'v1',
      createdAt,
      updatedAt: createdAt,
      verifiedAt: createdAt,
      lastAcceptedTimeStep: 123n,
    });

    expect(factor.properties.lastAcceptedTimeStep).toBe(123n);
    expect(
      () =>
        new MfaFactor({
          mfaFactorId: uuid('000000000005'),
          mfaEnrollmentId: uuid('000000000004'),
          factorType: 'TOTP_AUTHENTICATOR',
          factorState: 'PENDING_VERIFICATION',
          encryptedSecretOrReference: protectedValue('encrypted'),
          encryptionKeyVersion: 'v1',
          createdAt,
          updatedAt: createdAt,
          lastAcceptedTimeStep: -1n,
        }),
    ).toThrow('Last accepted TOTP time step must be non-negative');
    expect(
      () =>
        new MfaFactor({
          mfaFactorId: uuid('000000000005'),
          mfaEnrollmentId: uuid('000000000004'),
          factorType: 'TOTP_AUTHENTICATOR',
          factorState: 'ACTIVE',
          encryptedSecretOrReference: protectedValue('encrypted'),
          encryptionKeyVersion: 'v1',
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Active MFA factor requires verifiedAt');
    expect(
      () =>
        new MfaFactor({
          mfaFactorId: uuid('000000000005'),
          mfaEnrollmentId: uuid('000000000004'),
          factorType: 'TOTP_AUTHENTICATOR',
          factorState: 'REVOKED',
          encryptedSecretOrReference: protectedValue('encrypted'),
          encryptionKeyVersion: 'v1',
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Revoked MFA factor requires revokedAt');
  });

  it('constructs password and credential history records', () => {
    const passwordRecord = new PasswordHistoryRecord({
      passwordHistoryId: uuid('000000000006'),
      identityId: uuid('000000000001'),
      passwordHash: protectedValue('hash'),
      hashAlgorithmReference: 'argon2id-v19',
      createdAt,
    });

    expect(passwordRecord.properties.hashAlgorithmReference).toBe('argon2id-v19');
    expect(
      () =>
        new PasswordHistoryRecord({
          passwordHistoryId: uuid('000000000006'),
          identityId: uuid('000000000001'),
          passwordHash: protectedValue('hash'),
          hashAlgorithmReference: '   ',
          createdAt,
        }),
    ).toThrow('Hash algorithm reference cannot be empty');

    const historyRecord = new CredentialHistoryRecord({
      credentialHistoryId: uuid('000000000007'),
      identityId: uuid('000000000001'),
      credentialType: 'PASSWORD',
      credentialVersion: 1,
      eventType: 'CREATED',
      createdAt,
      correlationId: new CorrelationIdentifier('018f22e2-79b0-7cc3-8c5e-000000000008'),
    });

    expect(historyRecord.properties.eventType).toBe('CREATED');
  });

  it('enforces classification assignment and recovery code invariants', () => {
    const assignment = new AuthenticationSecurityClassificationAssignment({
      classificationAssignmentId: uuid('000000000009'),
      identityId: uuid('000000000001'),
      classification: 'STANDARD_AUTHENTICATION',
      effectiveAt: createdAt,
      assignmentState: 'EFFECTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt,
      updatedAt: createdAt,
    });

    expect(assignment.properties.assignmentState).toBe('EFFECTIVE');
    expect(
      () =>
        new AuthenticationSecurityClassificationAssignment({
          classificationAssignmentId: uuid('000000000009'),
          identityId: uuid('000000000001'),
          classification: 'STANDARD_AUTHENTICATION',
          effectiveAt: createdAt,
          assignmentState: 'ENDED',
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Ended classification assignment requires endedAt');

    const code = new RecoveryCodeRecord({
      recoveryCodeId: uuid('000000000010'),
      recoveryCodeSetId: uuid('000000000011'),
      codeDigest: protectedValue('digest'),
      codeState: 'ACTIVE',
      createdAt,
    });

    expect(code.properties.codeState).toBe('ACTIVE');
    expect(
      () =>
        new RecoveryCodeRecord({
          recoveryCodeId: uuid('000000000010'),
          recoveryCodeSetId: uuid('000000000011'),
          codeDigest: protectedValue('digest'),
          codeState: 'CONSUMED',
          createdAt,
        }),
    ).toThrow('Consumed Recovery Code requires consumedAt');
    expect(
      () =>
        new RecoveryCodeRecord({
          recoveryCodeId: uuid('000000000010'),
          recoveryCodeSetId: uuid('000000000011'),
          codeDigest: protectedValue('digest'),
          codeState: 'INVALIDATED',
          createdAt,
        }),
    ).toThrow('Invalidated Recovery Code requires invalidatedAt');

    const codeSet = new RecoveryCodeSet({
      recoveryCodeSetId: uuid('000000000011'),
      identityId: uuid('000000000001'),
      setVersion: 1,
      setState: 'ACTIVE',
      createdAt,
    });

    expect(codeSet.properties.setVersion).toBe(1);
    expect(
      () =>
        new RecoveryCodeSet({
          recoveryCodeSetId: uuid('000000000011'),
          identityId: uuid('000000000001'),
          setVersion: 0,
          setState: 'ACTIVE',
          createdAt,
        }),
    ).toThrow('Recovery Code Set version must be positive');
  });

  it('constructs a valid TrustedDevice and enforces its invariants', () => {
    const device = new TrustedDevice({
      trustedDeviceId: uuid('000000000012'),
      identityId: uuid('000000000001'),
      protectedDeviceFingerprint: protectedValue('fingerprint'),
      deviceState: 'TRUSTED',
      trustExpiresAt: oneHourLater,
      aggregateVersion: new AggregateVersion(1),
      createdAt,
      updatedAt: createdAt,
    });

    expect(device.properties.deviceState).toBe('TRUSTED');
    expect(
      () =>
        new TrustedDevice({
          trustedDeviceId: uuid('000000000012'),
          identityId: uuid('000000000001'),
          protectedDeviceFingerprint: protectedValue('fingerprint'),
          deviceState: 'TRUSTED',
          trustExpiresAt: createdAt,
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Trusted Device expiry must follow creation');
    expect(
      () =>
        new TrustedDevice({
          trustedDeviceId: uuid('000000000012'),
          identityId: uuid('000000000001'),
          protectedDeviceFingerprint: protectedValue('fingerprint'),
          deviceState: 'REVOKED',
          trustExpiresAt: oneHourLater,
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Revoked Trusted Device requires revokedAt');
  });

  it('enforces Identity state transition invariants', () => {
    const initial = new IdentityStateTransition({
      identityStateTransitionId: uuid('000000000013'),
      identityId: uuid('000000000001'),
      toState: 'PENDING_VERIFICATION',
      stateVersion: 1,
      transitionedAt: createdAt,
      createdAt,
    });

    expect(initial.properties.stateVersion).toBe(1);
    const nonInitial = new IdentityStateTransition({
      identityStateTransitionId: uuid('000000000014'),
      identityId: uuid('000000000001'),
      fromState: 'PENDING_VERIFICATION',
      toState: 'ACTIVE',
      stateVersion: 2,
      transitionedAt: createdAt,
      createdAt,
    });

    expect(nonInitial.properties.toState).toBe('ACTIVE');
    expect(
      () =>
        new IdentityStateTransition({
          identityStateTransitionId: uuid('000000000015'),
          identityId: uuid('000000000001'),
          fromState: 'ACTIVE',
          toState: 'ACTIVE',
          stateVersion: 2,
          transitionedAt: createdAt,
          createdAt,
        }),
    ).toThrow('Identity state transition must change state');
    expect(
      () =>
        new IdentityStateTransition({
          identityStateTransitionId: uuid('000000000015'),
          identityId: uuid('000000000001'),
          toState: 'ACTIVE',
          stateVersion: 1,
          transitionedAt: createdAt,
          createdAt,
        }),
    ).toThrow('Initial Identity transition');
    expect(
      () =>
        new IdentityStateTransition({
          identityStateTransitionId: uuid('000000000015'),
          identityId: uuid('000000000001'),
          toState: 'ACTIVE',
          stateVersion: 0,
          transitionedAt: createdAt,
          createdAt,
        }),
    ).toThrow('Identity state version must be positive');
    expect(
      () =>
        new IdentityStateTransition({
          identityStateTransitionId: uuid('000000000015'),
          identityId: uuid('000000000001'),
          toState: 'PENDING_VERIFICATION',
          stateVersion: 2,
          transitionedAt: createdAt,
          createdAt,
        }),
    ).toThrow('Non-initial Identity transition requires fromState');
    expect(
      () =>
        new IdentityStateTransition({
          identityStateTransitionId: uuid('000000000015'),
          identityId: uuid('000000000001'),
          fromState: 'PENDING_VERIFICATION',
          toState: 'ACTIVE',
          stateVersion: 2,
          transitionedAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Identity transition createdAt cannot precede transitionedAt');
  });
});

describe('Module 01 domain entities - Session', () => {
  it('constructs a valid Session and enforces its invariants', () => {
    const session = new Session({
      sessionId: uuid('000000000020'),
      identityId: uuid('000000000001'),
      sessionClass: 'INTERACTIVE_WEB',
      sessionState: 'ACTIVE',
      sessionVersion: new SessionVersion(1),
      authenticationAssurance: 'AAL1',
      authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
      authenticationMethods: ['PASSWORD'],
      createdAt,
      lastActivityAt: createdAt,
      idleExpiresAt: oneHourLater,
      absoluteExpiresAt: oneHourLater,
      aggregateVersion: new AggregateVersion(1),
    });

    expect(session.properties.authenticationMethods).toEqual(['PASSWORD']);
    expect(
      () =>
        new Session({
          sessionId: uuid('000000000020'),
          identityId: uuid('000000000001'),
          sessionClass: 'INTERACTIVE_WEB',
          sessionState: 'ACTIVE',
          sessionVersion: new SessionVersion(1),
          authenticationAssurance: 'AAL1',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD'],
          createdAt,
          lastActivityAt: createdAt,
          idleExpiresAt: oneHourLater,
          absoluteExpiresAt: createdAt,
          aggregateVersion: new AggregateVersion(1),
        }),
    ).toThrow('Session idle expiry cannot exceed absolute expiry');
    expect(
      () =>
        new Session({
          sessionId: uuid('000000000020'),
          identityId: uuid('000000000001'),
          sessionClass: 'INTERACTIVE_WEB',
          sessionState: 'ACTIVE',
          sessionVersion: new SessionVersion(1),
          authenticationAssurance: 'AAL1',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD'],
          createdAt,
          lastActivityAt: oneHourBefore,
          idleExpiresAt: oneHourLater,
          absoluteExpiresAt: oneHourLater,
          aggregateVersion: new AggregateVersion(1),
        }),
    ).toThrow('Session last activity cannot precede creation');
    expect(
      () =>
        new Session({
          sessionId: uuid('000000000020'),
          identityId: uuid('000000000001'),
          sessionClass: 'INTERACTIVE_WEB',
          sessionState: 'REVOKED',
          sessionVersion: new SessionVersion(1),
          authenticationAssurance: 'AAL1',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD'],
          createdAt,
          lastActivityAt: createdAt,
          idleExpiresAt: oneHourLater,
          absoluteExpiresAt: oneHourLater,
          aggregateVersion: new AggregateVersion(1),
        }),
    ).toThrow('Revoked Session requires revokedAt');
    expect(
      () =>
        new Session({
          sessionId: uuid('000000000020'),
          identityId: uuid('000000000001'),
          sessionClass: 'INTERACTIVE_WEB',
          sessionState: 'ACTIVE',
          sessionVersion: new SessionVersion(1),
          authenticationAssurance: 'AAL0',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD'],
          createdAt,
          lastActivityAt: createdAt,
          idleExpiresAt: oneHourLater,
          absoluteExpiresAt: oneHourLater,
          aggregateVersion: new AggregateVersion(1),
        }),
    ).toThrow('Ordinary authenticated Session cannot have AAL0');
  });

  it('allows a recovery-class Session at AAL0', () => {
    expect(
      () =>
        new Session({
          sessionId: uuid('000000000021'),
          identityId: uuid('000000000001'),
          sessionClass: 'RECOVERY',
          sessionState: 'ACTIVE',
          sessionVersion: new SessionVersion(1),
          authenticationAssurance: 'AAL0',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD'],
          createdAt,
          lastActivityAt: createdAt,
          idleExpiresAt: oneHourLater,
          absoluteExpiresAt: oneHourLater,
          aggregateVersion: new AggregateVersion(1),
        }),
    ).not.toThrow();
  });

  it('constructs a valid RefreshTokenFamily and enforces its invariants', () => {
    const family = new RefreshTokenFamily({
      tokenFamilyId: uuid('000000000022'),
      sessionId: uuid('000000000020'),
      familyState: 'ACTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt,
    });

    expect(family.properties.familyState).toBe('ACTIVE');
    expect(
      () =>
        new RefreshTokenFamily({
          tokenFamilyId: uuid('000000000022'),
          sessionId: uuid('000000000020'),
          familyState: 'REVOKED',
          aggregateVersion: new AggregateVersion(1),
          createdAt,
        }),
    ).toThrow('Revoked Refresh Token Family requires revokedAt');
  });

  it('constructs a valid RefreshTokenRecord and enforces its invariants', () => {
    const record = new RefreshTokenRecord({
      refreshTokenId: uuid('000000000023'),
      tokenFamilyId: uuid('000000000022'),
      tokenDigest: new RefreshTokenDigest('digest'),
      tokenState: 'ACTIVE',
      issuedAt: createdAt,
      expiresAt: oneHourLater,
      createdAt,
    });

    expect(record.properties.tokenState).toBe('ACTIVE');
    expect(
      () =>
        new RefreshTokenRecord({
          refreshTokenId: uuid('000000000023'),
          tokenFamilyId: uuid('000000000022'),
          tokenDigest: new RefreshTokenDigest('digest'),
          tokenState: 'ACTIVE',
          issuedAt: oneHourLater,
          expiresAt: createdAt,
          createdAt,
        }),
    ).toThrow('Refresh Token expiry must follow issuance');
    expect(
      () =>
        new RefreshTokenRecord({
          refreshTokenId: uuid('000000000023'),
          tokenFamilyId: uuid('000000000022'),
          tokenDigest: new RefreshTokenDigest('digest'),
          tokenState: 'USED',
          issuedAt: createdAt,
          expiresAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Used Refresh Token requires consumedAt');
    expect(
      () =>
        new RefreshTokenRecord({
          refreshTokenId: uuid('000000000023'),
          tokenFamilyId: uuid('000000000022'),
          tokenDigest: new RefreshTokenDigest('digest'),
          tokenState: 'REVOKED',
          issuedAt: createdAt,
          expiresAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Revoked Refresh Token requires revokedAt');
    expect(
      () =>
        new RefreshTokenRecord({
          refreshTokenId: uuid('000000000023'),
          tokenFamilyId: uuid('000000000022'),
          tokenDigest: new RefreshTokenDigest('digest'),
          tokenState: 'ACTIVE',
          issuedAt: createdAt,
          expiresAt: oneHourLater,
          createdAt,
          successorTokenId: uuid('000000000023'),
        }),
    ).toThrow('Refresh Token cannot succeed itself');
    expect(
      () =>
        new RefreshTokenRecord({
          refreshTokenId: uuid('000000000023'),
          tokenFamilyId: uuid('000000000022'),
          tokenDigest: new RefreshTokenDigest('digest'),
          tokenState: 'ACTIVE',
          issuedAt: createdAt,
          expiresAt: oneHourLater,
          createdAt,
          parentTokenId: uuid('000000000023'),
        }),
    ).toThrow('Refresh Token cannot parent itself');
  });
});

describe('Module 01 domain entities - Verification', () => {
  it('constructs a valid VerificationChallenge and enforces its invariants', () => {
    const challenge = new VerificationChallenge({
      challengeId: uuid('000000000030'),
      identityId: uuid('000000000001'),
      purpose: 'REGISTRATION_VERIFICATION',
      channelType: 'EMAIL',
      protectedDestinationReference: protectedValue('destination'),
      challengeDigest: protectedValue('digest'),
      challengeState: 'CREATED',
      attemptCount: 0,
      maximumAttempts: 5,
      expiresAt: oneHourLater,
      aggregateVersion: new AggregateVersion(1),
      createdAt,
      updatedAt: createdAt,
    });

    expect(challenge.properties.challengeState).toBe('CREATED');
    expect(
      () =>
        new VerificationChallenge({
          challengeId: uuid('000000000030'),
          identityId: uuid('000000000001'),
          purpose: 'REGISTRATION_VERIFICATION',
          channelType: 'EMAIL',
          protectedDestinationReference: protectedValue('destination'),
          challengeDigest: protectedValue('digest'),
          challengeState: 'CREATED',
          attemptCount: -1,
          maximumAttempts: 5,
          expiresAt: oneHourLater,
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Verification attempt count must be a non-negative integer');
    expect(
      () =>
        new VerificationChallenge({
          challengeId: uuid('000000000030'),
          identityId: uuid('000000000001'),
          purpose: 'REGISTRATION_VERIFICATION',
          channelType: 'EMAIL',
          protectedDestinationReference: protectedValue('destination'),
          challengeDigest: protectedValue('digest'),
          challengeState: 'CREATED',
          attemptCount: 0,
          maximumAttempts: 0,
          expiresAt: oneHourLater,
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Verification maximum attempts must be a positive integer');
    expect(
      () =>
        new VerificationChallenge({
          challengeId: uuid('000000000030'),
          identityId: uuid('000000000001'),
          purpose: 'REGISTRATION_VERIFICATION',
          channelType: 'EMAIL',
          protectedDestinationReference: protectedValue('destination'),
          challengeDigest: protectedValue('digest'),
          challengeState: 'CREATED',
          attemptCount: 6,
          maximumAttempts: 5,
          expiresAt: oneHourLater,
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Verification attempt count cannot exceed maximum attempts');
    expect(
      () =>
        new VerificationChallenge({
          challengeId: uuid('000000000030'),
          identityId: uuid('000000000001'),
          purpose: 'REGISTRATION_VERIFICATION',
          channelType: 'EMAIL',
          protectedDestinationReference: protectedValue('destination'),
          challengeDigest: protectedValue('digest'),
          challengeState: 'CREATED',
          attemptCount: 0,
          maximumAttempts: 5,
          expiresAt: createdAt,
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Verification Challenge must expire after creation');
  });

  it('constructs a valid VerificationAttempt and enforces its invariants', () => {
    const attempt = new VerificationAttempt({
      verificationAttemptId: uuid('000000000031'),
      challengeId: uuid('000000000030'),
      outcome: 'SUCCEEDED',
      attemptedAt: createdAt,
      createdAt,
    });

    expect(attempt.properties.outcome).toBe('SUCCEEDED');
    expect(
      () =>
        new VerificationAttempt({
          verificationAttemptId: uuid('000000000031'),
          challengeId: uuid('000000000030'),
          outcome: 'SUCCEEDED',
          attemptedAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Verification Attempt createdAt cannot precede attemptedAt');
  });

  it('constructs a valid OtpEvidenceRecord and enforces its invariants', () => {
    const evidence = new OtpEvidenceRecord({
      otpEvidenceId: uuid('000000000032'),
      challengeId: uuid('000000000030'),
      evidenceDigest: protectedValue('digest'),
      evidenceState: 'ACTIVE',
      expiresAt: oneHourLater,
      createdAt,
    });

    expect(evidence.properties.evidenceState).toBe('ACTIVE');
    expect(
      () =>
        new OtpEvidenceRecord({
          otpEvidenceId: uuid('000000000032'),
          challengeId: uuid('000000000030'),
          evidenceDigest: protectedValue('digest'),
          evidenceState: 'ACTIVE',
          expiresAt: createdAt,
          createdAt,
        }),
    ).toThrow('OTP Evidence must expire after creation');
    expect(
      () =>
        new OtpEvidenceRecord({
          otpEvidenceId: uuid('000000000032'),
          challengeId: uuid('000000000030'),
          evidenceDigest: protectedValue('digest'),
          evidenceState: 'CONSUMED',
          expiresAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Consumed OTP Evidence requires consumedAt');
  });
});

describe('Module 01 domain entities - Recovery', () => {
  it('constructs a valid RecoveryRequest and enforces its invariants', () => {
    const request = new RecoveryRequest({
      recoveryRequestId: uuid('000000000040'),
      identityId: uuid('000000000001'),
      operationClass: 'PASSWORD_RESET',
      recoveryState: 'REQUESTED',
      recoveryAssurance: 'RA0',
      recoveryPolicyVersion: new RecoveryPolicyVersion('1.0'),
      permittedOperation: new PermittedRecoveryOperation('PASSWORD_RESET'),
      stateVersion: 1,
      expiresAt: oneHourLater,
      aggregateVersion: new AggregateVersion(1),
      createdAt,
      updatedAt: createdAt,
    });

    expect(request.properties.recoveryState).toBe('REQUESTED');
    expect(
      () =>
        new RecoveryRequest({
          recoveryRequestId: uuid('000000000040'),
          identityId: uuid('000000000001'),
          operationClass: 'PASSWORD_RESET',
          recoveryState: 'REQUESTED',
          recoveryAssurance: 'RA0',
          recoveryPolicyVersion: new RecoveryPolicyVersion('1.0'),
          permittedOperation: new PermittedRecoveryOperation('PASSWORD_RESET'),
          stateVersion: 0,
          expiresAt: oneHourLater,
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Recovery Request state version must be positive');
    expect(
      () =>
        new RecoveryRequest({
          recoveryRequestId: uuid('000000000040'),
          identityId: uuid('000000000001'),
          operationClass: 'PASSWORD_RESET',
          recoveryState: 'REQUESTED',
          recoveryAssurance: 'RA0',
          recoveryPolicyVersion: new RecoveryPolicyVersion('1.0'),
          permittedOperation: new PermittedRecoveryOperation('PASSWORD_RESET'),
          stateVersion: 1,
          expiresAt: createdAt,
          aggregateVersion: new AggregateVersion(1),
          createdAt,
          updatedAt: createdAt,
        }),
    ).toThrow('Recovery Request must expire after creation');
  });

  it('constructs a valid RecoveryApprovalRecord and enforces its invariants', () => {
    const record = new RecoveryApprovalRecord({
      recoveryApprovalId: uuid('000000000041'),
      recoveryRequestId: uuid('000000000040'),
      recoveredIdentityId: uuid('000000000001'),
      operation: new PermittedRecoveryOperation('PASSWORD_RESET'),
      approverIdentityId: uuid('000000000042'),
      approverAuthenticationEvidenceReference: protectedValue('evidence'),
      decision: 'APPROVED',
      decidedAt: createdAt,
      expiresAt: oneHourLater,
      createdAt,
    });

    expect(record.properties.decision).toBe('APPROVED');
    const sameIdentity = uuid('000000000001');
    expect(
      () =>
        new RecoveryApprovalRecord({
          recoveryApprovalId: uuid('000000000041'),
          recoveryRequestId: uuid('000000000040'),
          recoveredIdentityId: sameIdentity,
          operation: new PermittedRecoveryOperation('PASSWORD_RESET'),
          approverIdentityId: sameIdentity,
          approverAuthenticationEvidenceReference: protectedValue('evidence'),
          decision: 'APPROVED',
          decidedAt: createdAt,
          expiresAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Recovery approver must be independent');
    expect(
      () =>
        new RecoveryApprovalRecord({
          recoveryApprovalId: uuid('000000000041'),
          recoveryRequestId: uuid('000000000040'),
          recoveredIdentityId: uuid('000000000001'),
          operation: new PermittedRecoveryOperation('PASSWORD_RESET'),
          approverIdentityId: uuid('000000000042'),
          approverAuthenticationEvidenceReference: protectedValue('evidence'),
          decision: 'APPROVED',
          decidedAt: createdAt,
          expiresAt: createdAt,
          createdAt,
        }),
    ).toThrow('Recovery Approval must expire after creation');
  });

  it('constructs a valid RecoveryAttempt and enforces its invariants', () => {
    const attempt = new RecoveryAttempt({
      recoveryAttemptId: uuid('000000000043'),
      recoveryRequestId: uuid('000000000040'),
      attemptType: 'EVIDENCE_SUBMISSION',
      outcome: 'SUCCEEDED',
      attemptedAt: createdAt,
      createdAt,
      protectedSourceIpReference: protectedValue('ip'),
      protectedDeviceReference: protectedValue('device'),
    });

    expect(attempt.properties.attemptType).toBe('EVIDENCE_SUBMISSION');
    expect(
      () =>
        new RecoveryAttempt({
          recoveryAttemptId: uuid('000000000043'),
          recoveryRequestId: uuid('000000000040'),
          attemptType: 'EVIDENCE_SUBMISSION',
          outcome: 'SUCCEEDED',
          attemptedAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Recovery Attempt createdAt cannot precede attemptedAt');
  });

  it('constructs a valid RecoveryEvidenceRecord and enforces its invariants', () => {
    const record = new RecoveryEvidenceRecord({
      recoveryEvidenceId: uuid('000000000044'),
      recoveryRequestId: uuid('000000000040'),
      evidenceType: 'VERIFIED_EMAIL_CHANNEL',
      protectedEvidenceReference: protectedValue('evidence'),
      evidenceState: 'PENDING',
      evidenceBoundary: 'EMAIL_CHANNEL',
      expiresAt: oneHourLater,
      createdAt,
    });

    expect(record.properties.evidenceState).toBe('PENDING');
    const verified = new RecoveryEvidenceRecord({
      recoveryEvidenceId: uuid('000000000045'),
      recoveryRequestId: uuid('000000000040'),
      evidenceType: 'VERIFIED_EMAIL_CHANNEL',
      protectedEvidenceReference: protectedValue('evidence'),
      evidenceState: 'VERIFIED',
      evidenceBoundary: 'EMAIL_CHANNEL',
      expiresAt: oneHourLater,
      createdAt,
      verifiedAt: createdAt,
    });

    expect(verified.properties.verifiedAt).toEqual(createdAt);
    expect(
      () =>
        new RecoveryEvidenceRecord({
          recoveryEvidenceId: uuid('000000000044'),
          recoveryRequestId: uuid('000000000040'),
          evidenceType: 'VERIFIED_EMAIL_CHANNEL',
          protectedEvidenceReference: protectedValue('evidence'),
          evidenceState: 'PENDING',
          evidenceBoundary: 'EMAIL_CHANNEL',
          expiresAt: createdAt,
          createdAt,
        }),
    ).toThrow('Recovery Evidence must expire after creation');
    expect(
      () =>
        new RecoveryEvidenceRecord({
          recoveryEvidenceId: uuid('000000000044'),
          recoveryRequestId: uuid('000000000040'),
          evidenceType: 'VERIFIED_EMAIL_CHANNEL',
          protectedEvidenceReference: protectedValue('evidence'),
          evidenceState: 'VERIFIED',
          evidenceBoundary: 'EMAIL_CHANNEL',
          expiresAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Verified Recovery Evidence requires verifiedAt');
    expect(
      () =>
        new RecoveryEvidenceRecord({
          recoveryEvidenceId: uuid('000000000044'),
          recoveryRequestId: uuid('000000000040'),
          evidenceType: 'VERIFIED_EMAIL_CHANNEL',
          protectedEvidenceReference: protectedValue('evidence'),
          evidenceState: 'CONSUMED',
          evidenceBoundary: 'EMAIL_CHANNEL',
          expiresAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Consumed Recovery Evidence requires consumedAt');
  });

  it('constructs a valid RecoveryNotificationRecord and enforces its invariants', () => {
    const record = new RecoveryNotificationRecord({
      recoveryNotificationId: uuid('000000000046'),
      recoveryRequestId: uuid('000000000040'),
      notificationType: 'RECOVERY_REQUEST_INITIATED',
      deliveryState: 'PENDING',
      protectedDestinationReference: protectedValue('destination'),
      createdAt,
    });

    expect(record.properties.deliveryState).toBe('PENDING');
    expect(
      () =>
        new RecoveryNotificationRecord({
          recoveryNotificationId: uuid('000000000046'),
          recoveryRequestId: uuid('000000000040'),
          notificationType: 'RECOVERY_REQUEST_INITIATED',
          deliveryState: 'DELIVERED',
          protectedDestinationReference: protectedValue('destination'),
          createdAt,
        }),
    ).toThrow('Delivered Recovery Notification requires deliveredAt');
    expect(
      () =>
        new RecoveryNotificationRecord({
          recoveryNotificationId: uuid('000000000046'),
          recoveryRequestId: uuid('000000000040'),
          notificationType: 'RECOVERY_REQUEST_INITIATED',
          deliveryState: 'FAILED',
          protectedDestinationReference: protectedValue('destination'),
          createdAt,
        }),
    ).toThrow('Failed Recovery Notification requires failedAt');
  });

  it('constructs a valid RecoveryStateTransition and enforces its invariants', () => {
    const transition = new RecoveryStateTransition({
      recoveryStateTransitionId: uuid('000000000047'),
      recoveryRequestId: uuid('000000000040'),
      fromState: 'REQUESTED',
      toState: 'EVIDENCE_PENDING',
      stateVersion: 1,
      transitionedAt: createdAt,
      createdAt,
      actorIdentityId: uuid('000000000001'),
      reasonCode: 'submitted',
      correlationId: new CorrelationIdentifier('018f22e2-79b0-7cc3-8c5e-000000000048'),
    });

    expect(transition.properties.toState).toBe('EVIDENCE_PENDING');
    expect(
      () =>
        new RecoveryStateTransition({
          recoveryStateTransitionId: uuid('000000000047'),
          recoveryRequestId: uuid('000000000040'),
          fromState: 'REQUESTED',
          toState: 'REQUESTED',
          stateVersion: 1,
          transitionedAt: createdAt,
          createdAt,
        }),
    ).toThrow('Recovery state transition must change state');
    expect(
      () =>
        new RecoveryStateTransition({
          recoveryStateTransitionId: uuid('000000000047'),
          recoveryRequestId: uuid('000000000040'),
          fromState: 'REQUESTED',
          toState: 'EVIDENCE_PENDING',
          stateVersion: 0,
          transitionedAt: createdAt,
          createdAt,
        }),
    ).toThrow('Recovery state version must be positive');
    expect(
      () =>
        new RecoveryStateTransition({
          recoveryStateTransitionId: uuid('000000000047'),
          recoveryRequestId: uuid('000000000040'),
          fromState: 'REQUESTED',
          toState: 'EVIDENCE_PENDING',
          stateVersion: 1,
          transitionedAt: oneHourLater,
          createdAt,
        }),
    ).toThrow('Recovery transition createdAt cannot precede transitionedAt');
  });
});
