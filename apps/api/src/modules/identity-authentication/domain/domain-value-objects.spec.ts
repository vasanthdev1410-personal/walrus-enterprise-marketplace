import { OptimisticConcurrencyError } from './shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from './shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from './shared/value-objects/correlation-identifier';
import { ProtectedValue } from './shared/value-objects/protected-value';
import { UuidV7 } from './shared/value-objects/uuid-v7';
import { AUTHENTICATION_ASSURANCE_LEVELS } from './session/value-objects/authentication-assurance-level';
import { AUTHENTICATION_METHODS } from './session/value-objects/authentication-method';
import { RefreshTokenDigest } from './session/value-objects/refresh-token-digest';
import {
  REFRESH_TOKEN_FAMILY_STATES,
  REFRESH_TOKEN_STATES,
} from './session/value-objects/refresh-token-state';
import { SESSION_CLASSES } from './session/value-objects/session-class';
import { SESSION_STATES } from './session/value-objects/session-state';
import { SessionVersion } from './session/value-objects/session-version';
import { AUTHENTICATION_SECURITY_CLASSIFICATIONS } from './identity/value-objects/authentication-security-classification';
import { CanonicalEmailAddress } from './identity/value-objects/canonical-email-address';
import { CanonicalMobileNumber } from './identity/value-objects/canonical-mobile-number';
import { canonicalizeIdentifier } from './identity/value-objects/canonicalize-identifier';
import { CREDENTIAL_HISTORY_EVENT_TYPES } from './identity/value-objects/credential-history-event-type';
import { CREDENTIAL_STATES } from './identity/value-objects/credential-state';
import { CREDENTIAL_TYPES } from './identity/value-objects/credential-type';
import { IDENTIFIER_TYPES } from './identity/value-objects/identifier-type';
import { IDENTITY_STATES } from './identity/value-objects/identity-state';
import { MFA_FACTOR_STATES } from './identity/value-objects/mfa-factor-state';
import { MFA_ENROLLMENT_STATES, MFA_FACTOR_TYPES } from './identity/value-objects/mfa-factor-type';
import {
  RECOVERY_CODE_SET_STATES,
  RECOVERY_CODE_STATES,
} from './identity/value-objects/recovery-code-state';
import { TRUSTED_DEVICE_STATES } from './identity/value-objects/trusted-device-state';
import {
  IDENTIFIER_VERIFICATION_STATES,
  IDENTITY_VERIFICATION_STATES,
} from './identity/value-objects/verification-state';
import { PermittedRecoveryOperation } from './recovery/value-objects/permitted-recovery-operation';
import { RECOVERY_APPROVAL_DECISIONS } from './recovery/value-objects/recovery-approval-decision';
import { RECOVERY_ASSURANCE_LEVELS } from './recovery/value-objects/recovery-assurance-level';
import {
  RECOVERY_ATTEMPT_OUTCOMES,
  RECOVERY_ATTEMPT_TYPES,
} from './recovery/value-objects/recovery-attempt';
import {
  RECOVERY_EVIDENCE_BOUNDARIES,
  RECOVERY_EVIDENCE_STATES,
  RECOVERY_EVIDENCE_TYPES,
} from './recovery/value-objects/recovery-evidence';
import {
  RECOVERY_NOTIFICATION_DELIVERY_STATES,
  RECOVERY_NOTIFICATION_TYPES,
} from './recovery/value-objects/recovery-notification';
import { RECOVERY_OPERATION_CLASSES } from './recovery/value-objects/recovery-operation-class';
import { RecoveryPolicyVersion } from './recovery/value-objects/recovery-policy-version';
import { RECOVERY_STATES } from './recovery/value-objects/recovery-state';
import { VERIFICATION_CHALLENGE_STATES } from './verification/value-objects/challenge-state';
import { OTP_EVIDENCE_STATES } from './verification/value-objects/otp-evidence-state';
import { VERIFICATION_ATTEMPT_OUTCOMES } from './verification/value-objects/verification-attempt-outcome';
import { VERIFICATION_CHANNELS } from './verification/value-objects/verification-channel';
import { VERIFICATION_PURPOSES } from './verification/value-objects/verification-purpose';

describe('Module 01 domain value objects - state enumerations', () => {
  it('exposes the approved Identity lifecycle states', () => {
    expect(IDENTITY_STATES).toEqual([
      'PENDING_VERIFICATION',
      'ACTIVE',
      'LOCKED',
      'SUSPENDED',
      'DISABLED',
      'DELETED',
    ]);
    expect(IDENTITY_VERIFICATION_STATES).toEqual(['PENDING_VERIFICATION', 'VERIFIED']);
    expect(IDENTIFIER_VERIFICATION_STATES).toEqual([
      'UNVERIFIED',
      'PENDING_VERIFICATION',
      'VERIFIED',
      'RETIRED',
      'ANONYMIZED',
    ]);
    expect(IDENTIFIER_TYPES).toEqual(['EMAIL', 'MOBILE']);
  });

  it('exposes the approved Credential states', () => {
    expect(CREDENTIAL_TYPES).toEqual(['PASSWORD', 'EMAIL_VERIFICATION', 'MOBILE_VERIFICATION']);
    expect(CREDENTIAL_STATES).toEqual([
      'CREATED',
      'VERIFIED',
      'ACTIVE',
      'REPLACED',
      'COMPROMISED',
      'REVOKED',
    ]);
    expect(CREDENTIAL_HISTORY_EVENT_TYPES).toEqual([
      'CREATED',
      'VERIFIED',
      'ACTIVATED',
      'REPLACED',
      'MARKED_COMPROMISED',
      'REVOKED',
    ]);
  });

  it('exposes the approved MFA and trusted-device states', () => {
    expect(MFA_FACTOR_TYPES).toEqual(['TOTP_AUTHENTICATOR']);
    expect(MFA_FACTOR_STATES).toEqual([
      'PENDING_VERIFICATION',
      'ACTIVE',
      'REPLACEMENT_REQUIRED',
      'REVOKED',
    ]);
    expect(MFA_ENROLLMENT_STATES).toEqual([
      'PENDING_VERIFICATION',
      'ACTIVE',
      'REPLACEMENT_REQUIRED',
      'DISABLED',
    ]);
    expect(TRUSTED_DEVICE_STATES).toEqual(['PENDING', 'TRUSTED', 'EXPIRED', 'REVOKED', 'BLOCKED']);
  });

  it('exposes the approved recovery-code states', () => {
    expect(RECOVERY_CODE_SET_STATES).toEqual(['ACTIVE', 'EXHAUSTED', 'SUPERSEDED', 'INVALIDATED']);
    expect(RECOVERY_CODE_STATES).toEqual(['ACTIVE', 'CONSUMED', 'INVALIDATED']);
  });

  it('exposes the approved Session value objects', () => {
    expect(SESSION_CLASSES).toEqual(['INTERACTIVE_WEB', 'INTERACTIVE_MOBILE', 'RECOVERY']);
    expect(SESSION_STATES).toEqual(['ACTIVE', 'REVOKED', 'EXPIRED']);
    expect(AUTHENTICATION_ASSURANCE_LEVELS).toEqual(['AAL0', 'AAL1', 'AAL2']);
    expect(AUTHENTICATION_METHODS).toEqual([
      'PASSWORD',
      'EMAIL_OTP',
      'SMS_OTP',
      'TOTP_AUTHENTICATOR',
    ]);
    expect(REFRESH_TOKEN_STATES).toEqual(['ACTIVE', 'USED', 'REVOKED', 'EXPIRED']);
    expect(REFRESH_TOKEN_FAMILY_STATES).toEqual(['ACTIVE', 'REVOKED', 'EXPIRED']);
    expect(AUTHENTICATION_SECURITY_CLASSIFICATIONS).toEqual([
      'STANDARD_AUTHENTICATION',
      'PRIVILEGED_ADMIN_AUTHENTICATION',
      'SUPER_ADMIN_AUTHENTICATION',
    ]);
  });

  it('exposes the approved Recovery value objects', () => {
    expect(RECOVERY_STATES).toEqual([
      'REQUESTED',
      'EVIDENCE_PENDING',
      'EVIDENCE_VERIFIED',
      'APPROVAL_PENDING',
      'APPROVED',
      'EXECUTING',
      'COMPLETED',
      'REJECTED',
      'CANCELLED',
      'EXPIRED',
      'FAILED_SECURELY',
    ]);
    expect(RECOVERY_APPROVAL_DECISIONS).toEqual(['APPROVED', 'REJECTED']);
    expect(RECOVERY_ASSURANCE_LEVELS).toEqual(['RA0', 'RA1', 'RA2']);
    expect(RECOVERY_OPERATION_CLASSES).toEqual([
      'PASSWORD_RESET',
      'MFA_FACTOR_REPLACEMENT',
      'RECOVERY_CODE_REGENERATION',
      'VERIFIED_EMAIL_CHANGE',
      'VERIFIED_MOBILE_CHANGE',
      'IDENTITY_UNLOCK',
      'COMPROMISED_CREDENTIAL_RECOVERY',
      'PRIVILEGED_ACCOUNT_RECOVERY',
      'SUPER_ADMIN_EMERGENCY_RECOVERY',
    ]);
    expect(RECOVERY_ATTEMPT_TYPES).toEqual([
      'EVIDENCE_SUBMISSION',
      'EVIDENCE_VALIDATION',
      'APPROVAL_VALIDATION',
      'EXECUTION',
    ]);
    expect(RECOVERY_ATTEMPT_OUTCOMES).toEqual([
      'SUCCEEDED',
      'REJECTED',
      'FAILED_SECURELY',
      'TEMPORARILY_UNAVAILABLE',
    ]);
    expect(RECOVERY_EVIDENCE_TYPES).toEqual([
      'VERIFIED_EMAIL_CHANNEL',
      'VERIFIED_MOBILE_CHANNEL',
      'RECOVERY_CODE',
      'AUTHENTICATED_SESSION',
      'MFA_FACTOR',
      'CONTROLLED_BOOTSTRAP_EVIDENCE',
    ]);
    expect(RECOVERY_EVIDENCE_STATES).toEqual([
      'PENDING',
      'VERIFIED',
      'REJECTED',
      'CONSUMED',
      'EXPIRED',
      'INVALIDATED',
    ]);
    expect(RECOVERY_EVIDENCE_BOUNDARIES).toEqual([
      'EMAIL_CHANNEL',
      'MOBILE_CHANNEL',
      'RECOVERY_CODE_SET',
      'AUTHENTICATED_SESSION',
      'MFA_FACTOR',
      'CONTROLLED_BOOTSTRAP',
    ]);
    expect(RECOVERY_NOTIFICATION_TYPES).toEqual([
      'RECOVERY_REQUEST_INITIATED',
      'RECOVERY_CHALLENGE_SENT',
      'PASSWORD_RESET_COMPLETED',
      'MFA_RESET_COMPLETED',
      'TRUSTED_DEVICE_REMOVED',
      'CONTACT_INFORMATION_UPDATED',
      'RECOVERY_COMPLETED',
      'SUSPICIOUS_RECOVERY_ATTEMPT',
    ]);
    expect(RECOVERY_NOTIFICATION_DELIVERY_STATES).toEqual([
      'PENDING',
      'DISPATCHED',
      'DELIVERED',
      'FAILED',
    ]);
  });

  it('exposes the approved Verification value objects', () => {
    expect(VERIFICATION_PURPOSES).toEqual([
      'REGISTRATION_VERIFICATION',
      'PRIVILEGED_INVITATION_VERIFICATION',
      'CONTACT_CHANGE_VERIFICATION',
      'PASSWORD_RECOVERY',
      'ACCOUNT_RECOVERY',
      'MFA_ENROLLMENT',
      'MFA_AUTHENTICATION',
      'STEP_UP_AUTHENTICATION',
      'ADDITIONAL_SECURITY_VERIFICATION',
    ]);
    expect(VERIFICATION_CHANNELS).toEqual(['EMAIL', 'SMS', 'AUTHENTICATOR_APPLICATION']);
    expect(VERIFICATION_CHALLENGE_STATES).toEqual([
      'CREATED',
      'PENDING',
      'CHALLENGE_ISSUED',
      'VERIFIED',
      'EXPIRED',
      'FAILED',
      'CANCELLED',
    ]);
    expect(VERIFICATION_ATTEMPT_OUTCOMES).toEqual([
      'SUCCEEDED',
      'REJECTED',
      'EXPIRED',
      'RATE_LIMITED',
      'FAILED_SECURELY',
      'TEMPORARILY_UNAVAILABLE',
    ]);
    expect(OTP_EVIDENCE_STATES).toEqual(['ACTIVE', 'CONSUMED', 'EXPIRED', 'INVALIDATED']);
  });
});

describe('Module 01 domain value objects - identifiers and protected values', () => {
  it('accepts only UUID version 7 values and normalizes them', () => {
    const identifier = new UuidV7('018F22E2-79B0-7CC3-8C5E-000000000001');

    expect(identifier.value).toBe('018f22e2-79b0-7cc3-8c5e-000000000001');
    expect(identifier.toString()).toBe('018f22e2-79b0-7cc3-8c5e-000000000001');
    expect(() => new UuidV7('018f22e2-79b0-6cc3-8c5e-000000000001')).toThrow(
      'Value must be a UUID version 7',
    );
    expect(() => new UuidV7('not-a-uuid')).toThrow('Value must be a UUID version 7');
    expect(new CorrelationIdentifier('018f22e2-79b0-7cc3-8c5e-000000000002').value).toBe(
      '018f22e2-79b0-7cc3-8c5e-000000000002',
    );
    expect(() => new CorrelationIdentifier('018f22e2-79b0-6cc3-8c5e-000000000002')).toThrow(
      'Value must be a UUID version 7',
    );
  });

  it('never exposes protected values and rejects empty secrets', () => {
    const protectedValue = new ProtectedValue('secret-value');

    expect(protectedValue.value).toBe('secret-value');
    expect(protectedValue.toString()).toBe('[PROTECTED]');
    expect(protectedValue.toJSON()).toBe('[PROTECTED]');
    expect(() => new ProtectedValue('')).toThrow('Protected value cannot be empty');

    const digest = new RefreshTokenDigest('opaque-token-digest');
    expect(digest.toString()).toBe('[PROTECTED]');
  });

  it('validates positive safe integer versions', () => {
    expect(new AggregateVersion(1).value).toBe(1);
    expect(new SessionVersion(3).value).toBe(3);
    expect(() => new AggregateVersion(0)).toThrow(
      'Aggregate version must be a positive safe integer',
    );
    expect(() => new AggregateVersion(1.5)).toThrow(
      'Aggregate version must be a positive safe integer',
    );
    expect(() => new SessionVersion(0)).toThrow('Session version must be a positive safe integer');
  });

  it('validates recovery policy versions and permitted operations', () => {
    expect(new RecoveryPolicyVersion('1.0').value).toBe('1.0');
    expect(() => new RecoveryPolicyVersion('   ')).toThrow(
      'Recovery policy version cannot be empty',
    );
    expect(new PermittedRecoveryOperation('PASSWORD_RESET').value).toBe('PASSWORD_RESET');
  });

  it('canonicalizes email addresses and mobile numbers by type', () => {
    expect(new CanonicalEmailAddress('  User@Example.COM ').value).toBe('user@example.com');
    expect(() => new CanonicalEmailAddress('not-an-email')).toThrow('Email address is invalid');
    expect(new CanonicalMobileNumber('  +15551234567 ').value).toBe('+15551234567');
    expect(() => new CanonicalMobileNumber('5551234567')).toThrow(
      'Mobile number must use normalized international format',
    );
    expect(canonicalizeIdentifier('EMAIL', '  USER@EXAMPLE.COM ')).toBe('user@example.com');
    expect(canonicalizeIdentifier('MOBILE', '+15551234567')).toBe('+15551234567');
  });

  it('describes optimistic concurrency failures', () => {
    const error = new OptimisticConcurrencyError('Identity');

    expect(error.message).toBe('Identity was changed by another transaction');
    expect(error.name).toBe('OptimisticConcurrencyError');
  });
});
