import type { Identity } from '../entities/identity';
import type { AuthenticationSecurityClassificationAssignment } from '../entities/authentication-security-classification-assignment';
import type { Credential } from '../entities/credential';
import type { CredentialHistoryRecord } from '../entities/credential-history-record';
import type { IdentityIdentifier } from '../entities/identity-identifier';
import type { IdentityStateTransition } from '../entities/identity-state-transition';
import type { MfaEnrollment } from '../entities/mfa-enrollment';
import type { MfaFactor } from '../entities/mfa-factor';
import type { PasswordHistoryRecord } from '../entities/password-history-record';
import type { RecoveryCodeRecord } from '../entities/recovery-code-record';
import type { RecoveryCodeSet } from '../entities/recovery-code-set';
import type { TrustedDevice } from '../entities/trusted-device';
import type { AggregateVersion } from '../../shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { IdentifierType } from '../value-objects/identifier-type';

export interface IdentityRepository {
  findById(identityId: UuidV7): Promise<Identity | null>;
  findAuthenticationById(identityId: UuidV7): Promise<IdentityAuthenticationSnapshot | null>;
  findByIdentifierLookups(
    identifierType: IdentifierType,
    lookupDigests: readonly ProtectedValue[],
  ): Promise<IdentityAuthenticationSnapshot | null>;
  /**
   * Returns the most recent password hashes for an identity (newest first),
   * capped at the configured history depth. Used to enforce the approved
   * password-reuse policy (M01-CRED-001).
   */
  findPasswordHistory(identityId: UuidV7, limit: number): Promise<readonly PasswordHistoryRecord[]>;
  /**
   * Returns the identity's recovery-code sets and their codes, newest set
   * first. Used by the approved recovery-code lifecycle (M01-MFA-005).
   * Returns null when the identity does not exist.
   */
  findRecoveryCodeSets(identityId: UuidV7): Promise<RecoveryCodeSetsSnapshot | null>;
  insert(changeSet: IdentityAggregateChangeSet): Promise<void>;
  save(changeSet: IdentityAggregateChangeSet, expectedVersion: AggregateVersion): Promise<void>;
  advanceTotpReplayState(
    mfaFactorId: UuidV7,
    candidateTimeStep: bigint,
    usedAt: Date,
  ): Promise<boolean>;
}

export interface IdentityAuthenticationSnapshot {
  readonly identity: Identity;
  readonly identifiers: readonly IdentityIdentifier[];
  readonly credentials: readonly Credential[];
  readonly classificationAssignments: readonly AuthenticationSecurityClassificationAssignment[];
  readonly mfaEnrollments: readonly MfaEnrollment[];
  readonly mfaFactors: readonly MfaFactor[];
  /**
   * The identity's trusted devices. Loaded by findAuthenticationById for the
   * approved recovery completion effects (M01-REC-006) so applicable devices
   * can be invalidated; consumers that never invalidate devices may treat an
   * absent collection as "no devices loaded".
   */
  readonly trustedDevices?: readonly TrustedDevice[];
}

export interface RecoveryCodeSetsSnapshot {
  /** Sets ordered by setVersion descending (newest first). */
  readonly recoveryCodeSets: readonly RecoveryCodeSet[];
  readonly recoveryCodes: readonly RecoveryCodeRecord[];
}

export interface IdentityAggregateChangeSet {
  readonly identity: Identity;
  readonly identifiers: readonly IdentityIdentifier[];
  readonly credentials: readonly Credential[];
  readonly classificationAssignments: readonly AuthenticationSecurityClassificationAssignment[];
  readonly mfaEnrollments: readonly MfaEnrollment[];
  readonly mfaFactors: readonly MfaFactor[];
  readonly recoveryCodeSets: readonly RecoveryCodeSet[];
  readonly recoveryCodes: readonly RecoveryCodeRecord[];
  readonly trustedDevices: readonly TrustedDevice[];
  readonly credentialHistoryToAppend: readonly CredentialHistoryRecord[];
  readonly passwordHistoryToAppend: readonly PasswordHistoryRecord[];
  readonly stateTransitionsToAppend: readonly IdentityStateTransition[];
}
