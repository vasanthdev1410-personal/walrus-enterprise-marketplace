import { AuthenticationSecurityClassificationAssignment } from '../../domain/identity/entities/authentication-security-classification-assignment';
import { Credential } from '../../domain/identity/entities/credential';
import { CredentialHistoryRecord } from '../../domain/identity/entities/credential-history-record';
import { Identity } from '../../domain/identity/entities/identity';
import { IdentityIdentifier } from '../../domain/identity/entities/identity-identifier';
import { IdentityStateTransition } from '../../domain/identity/entities/identity-state-transition';
import { PasswordHistoryRecord } from '../../domain/identity/entities/password-history-record';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { AuthenticationSecurityClassification } from '../../domain/identity/value-objects/authentication-security-classification';
import { canonicalizeIdentifier } from '../../domain/identity/value-objects/canonicalize-identifier';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { CredentialError } from '../errors/credential.error';
import { IdentityError } from '../errors/identity.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import type { PasswordHashingPort } from '../ports/password-hashing.port';

export interface RegisterIdentityCommand {
  readonly identifierType: IdentifierType;
  readonly identifier: string;
  readonly password: string;
  readonly classification?: AuthenticationSecurityClassification;
}

export interface IdentityManagementApplicationOptions {
  readonly environment: string;
  readonly minimumPasswordLength: number;
  readonly maximumPasswordLength: number;
  readonly passwordHistoryDepth: number;
}

export interface IdentityProfileResult {
  readonly identityId: string;
  readonly identityState: string;
  readonly verificationState: string;
  readonly aggregateVersion: number;
  readonly classification: string;
  readonly primaryIdentifier?:
    | {
        readonly identifierType: string;
        readonly verificationState: string;
      }
    | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly disabledAt?: Date | undefined;
  readonly anonymizedAt?: Date | undefined;
  readonly deletionRequestedAt?: Date | undefined;
}

/**
 * Self-service Identity lifecycle command (M01-ID-004 / M01-ID-005).
 *
 * `authorizingSessionId`/`expectedAuthorizingSessionVersion` identify the caller's
 * current authoritative Session when the operation is performed self-service. When
 * both are present, every active Session of the Identity is revoked after the
 * lifecycle change commits so a deactivated or tombstoned Identity cannot keep
 * using already-issued credentials.
 */
export interface IdentityLifecycleCommand {
  readonly reasonCode?: string | undefined;
  readonly authorizingSessionId?: UuidV7 | undefined;
  readonly expectedAuthorizingSessionVersion?: number | undefined;
}

/**
 * M01-CRED-001. Authenticated password change command. The caller must prove
 * knowledge of the current password (re-authentication), the identity version
 * must match the If-Match precondition, and the authorizing Session is revoked
 * alongside every other active Session once the change commits.
 */
export interface ChangePasswordCommand {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly expectedIdentityVersion: number;
  readonly authorizingSessionId: UuidV7;
  readonly expectedAuthorizingSessionVersion: number;
}

export class IdentityManagementApplicationService {
  public constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordHashing: PasswordHashingPort,
    private readonly identifierLookup: IdentifierLookupCryptographicPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly options: IdentityManagementApplicationOptions,
  ) {}

  public async register(command: RegisterIdentityCommand): Promise<IdentityProfileResult> {
    if (
      command.classification !== undefined &&
      command.classification !== 'STANDARD_AUTHENTICATION'
    ) {
      // Privileged authentication classifications are assigned exclusively by the
      // approved internal M01-CLS-001 operation; self-service registration must
      // never allow a caller to self-assert an elevated classification.
      throw new IdentityError('CLASSIFICATION_NOT_PERMITTED');
    }
    let canonicalValue: string;
    try {
      canonicalValue = canonicalizeIdentifier(command.identifierType, command.identifier);
    } catch {
      throw new IdentityError('IDENTIFIER_INVALID');
    }
    const lookups = this.identifierLookup.createLookupsForResolution({
      environment: this.options.environment,
      identifierType: command.identifierType,
      canonicalValue,
    });

    const lookupProtectedValues = lookups.map((val) => new ProtectedValue(val));
    const existingSnapshot = await this.identityRepository.findByIdentifierLookups(
      command.identifierType,
      lookupProtectedValues,
    );
    if (existingSnapshot !== null) {
      throw new IdentityError('IDENTIFIER_ALREADY_REGISTERED');
    }

    const passwordHash = await this.passwordHashing.hash(command.password);
    const now = this.clock.now();

    const identityId = this.identifiers.next();
    const identifierId = this.identifiers.next();
    const credentialId = this.identifiers.next();
    const classificationAssignmentId = this.identifiers.next();
    const stateTransitionId = this.identifiers.next();

    const identity = new Identity({
      identityId,
      identityState: 'PENDING_VERIFICATION',
      verificationState: 'PENDING_VERIFICATION',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });

    const identifierEntity = new IdentityIdentifier({
      identifierId,
      identityId,
      identifierType: command.identifierType,
      protectedNormalizedValue: new ProtectedValue(canonicalValue),
      lookupDigest: new ProtectedValue(lookups[0] ?? canonicalValue),
      lookupKeyVersion: 'v1',
      verificationState: 'UNVERIFIED',
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
    });

    const credential = new Credential({
      credentialId,
      identityId,
      credentialType: 'PASSWORD',
      credentialVersion: 1,
      credentialState: 'ACTIVE',
      protectedSecret: new ProtectedValue(passwordHash),
      protectionKeyVersion: 'v1',
      createdAt: now,
      updatedAt: now,
    });

    const classification = command.classification ?? 'STANDARD_AUTHENTICATION';
    const classificationAssignment = new AuthenticationSecurityClassificationAssignment({
      classificationAssignmentId,
      identityId,
      classification,
      effectiveAt: now,
      assignmentState: 'EFFECTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });

    const stateTransition = new IdentityStateTransition({
      identityStateTransitionId: stateTransitionId,
      identityId,
      toState: 'PENDING_VERIFICATION',
      stateVersion: 1,
      transitionedAt: now,
      createdAt: now,
    });

    try {
      await this.identityRepository.insert({
        identity,
        identifiers: [identifierEntity],
        credentials: [credential],
        classificationAssignments: [classificationAssignment],
        mfaEnrollments: [],
        mfaFactors: [],
        recoveryCodeSets: [],
        recoveryCodes: [],
        trustedDevices: [],
        credentialHistoryToAppend: [],
        passwordHistoryToAppend: [],
        stateTransitionsToAppend: [stateTransition],
      });
    } catch (error) {
      // Two concurrent registrations may both pass the ownership check; the
      // unique [identifierType, lookupDigest] constraint is authoritative.
      // Surface the race as the same already-registered outcome instead of an
      // opaque 500 so the registration contract stays enumeration-safe.
      if (isUniqueConstraintViolation(error)) {
        throw new IdentityError('IDENTIFIER_ALREADY_REGISTERED');
      }
      throw error;
    }

    return {
      identityId: identityId.value,
      identityState: 'PENDING_VERIFICATION',
      verificationState: 'PENDING_VERIFICATION',
      aggregateVersion: 1,
      classification,
      primaryIdentifier: {
        identifierType: command.identifierType,
        verificationState: 'UNVERIFIED',
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  public async getProfile(identityId: UuidV7): Promise<IdentityProfileResult> {
    const snapshot = await this.identityRepository.findAuthenticationById(identityId);
    if (snapshot === null) {
      throw new IdentityError('IDENTITY_NOT_FOUND');
    }
    return this.mapToProfileResult(snapshot);
  }

  /**
   * M01-ID-003 self-service profile update (minimal contract).
   *
   * Module 01's approved scope defines no directly user-mutable profile fields:
   * the Identity aggregate carries lifecycle state only (identifier changes belong
   * to verification workflows and classification changes belong to the internal
   * M01-CLS operation). The request body is validated at the presentation layer so
   * unknown fields are rejected, and this operation performs a version-safe
   * resource update that advances the aggregate version and `updatedAt` without
   * creating an Identity State Transition (per the approved versioning rules,
   * non-state-changing updates may advance the version without a transition).
   */
  public async updateProfile(identityId: UuidV7): Promise<IdentityProfileResult> {
    const snapshot = await this.identityRepository.findAuthenticationById(identityId);
    if (snapshot === null) {
      throw new IdentityError('IDENTITY_NOT_FOUND');
    }

    const now = this.clock.now();
    const updatedIdentity = new Identity({
      ...snapshot.identity.properties,
      aggregateVersion: new AggregateVersion(
        snapshot.identity.properties.aggregateVersion.value + 1,
      ),
      updatedAt: now,
    });

    await this.identityRepository.save(
      {
        identity: updatedIdentity,
        identifiers: snapshot.identifiers,
        credentials: snapshot.credentials,
        classificationAssignments: snapshot.classificationAssignments,
        mfaEnrollments: snapshot.mfaEnrollments,
        mfaFactors: snapshot.mfaFactors,
        recoveryCodeSets: [],
        recoveryCodes: [],
        trustedDevices: [],
        credentialHistoryToAppend: [],
        passwordHistoryToAppend: [],
        stateTransitionsToAppend: [],
      },
      snapshot.identity.properties.aggregateVersion,
    );

    return this.mapToProfileResult({ ...snapshot, identity: updatedIdentity });
  }

  /**
   * M01-ID-004 deactivation. Marks the Identity DISABLED, appends an approved
   * Identity State Transition, and authoritatively revokes every active Session
   * when the operation is performed self-service.
   */
  public async deactivate(
    identityId: UuidV7,
    command: IdentityLifecycleCommand = {},
  ): Promise<IdentityProfileResult> {
    const snapshot = await this.identityRepository.findAuthenticationById(identityId);
    if (snapshot === null) {
      throw new IdentityError('IDENTITY_NOT_FOUND');
    }
    if (snapshot.identity.properties.identityState === 'DISABLED') {
      throw new IdentityError('IDENTITY_ALREADY_DEACTIVATED');
    }

    const now = this.clock.now();
    const currentState = snapshot.identity.properties.identityState;
    const currentVersion = snapshot.identity.properties.aggregateVersion.value;
    const updatedVersion = new AggregateVersion(currentVersion + 1);
    const transitionId = this.identifiers.next();

    const updatedIdentity = new Identity({
      ...snapshot.identity.properties,
      identityState: 'DISABLED',
      disabledAt: now,
      aggregateVersion: updatedVersion,
      updatedAt: now,
    });

    const stateTransition = new IdentityStateTransition({
      identityStateTransitionId: transitionId,
      identityId,
      fromState: currentState,
      toState: 'DISABLED',
      stateVersion: currentVersion + 1,
      transitionedAt: now,
      createdAt: now,
      reasonCode: command.reasonCode ?? 'USER_DEACTIVATION',
    });

    await this.identityRepository.save(
      {
        identity: updatedIdentity,
        identifiers: snapshot.identifiers,
        credentials: snapshot.credentials,
        classificationAssignments: snapshot.classificationAssignments,
        mfaEnrollments: snapshot.mfaEnrollments,
        mfaFactors: snapshot.mfaFactors,
        recoveryCodeSets: [],
        recoveryCodes: [],
        trustedDevices: [],
        credentialHistoryToAppend: [],
        passwordHistoryToAppend: [],
        stateTransitionsToAppend: [stateTransition],
      },
      snapshot.identity.properties.aggregateVersion,
    );

    await this.revokeAllSessions(identityId, command, 'IDENTITY_DEACTIVATED');
    return this.mapToProfileResult({ ...snapshot, identity: updatedIdentity });
  }

  /**
   * M01-ID-005 soft delete / tombstone. Marks the Identity DELETED, records the
   * deletion request, appends an approved Identity State Transition, and
   * authoritatively revokes every active Session when performed self-service.
   */
  public async softDelete(
    identityId: UuidV7,
    command: IdentityLifecycleCommand = {},
  ): Promise<IdentityProfileResult> {
    const snapshot = await this.identityRepository.findAuthenticationById(identityId);
    if (snapshot === null) {
      throw new IdentityError('IDENTITY_NOT_FOUND');
    }
    if (snapshot.identity.properties.identityState === 'DELETED') {
      throw new IdentityError('IDENTITY_ALREADY_PENDING_DELETION');
    }

    const now = this.clock.now();
    const currentState = snapshot.identity.properties.identityState;
    const currentVersion = snapshot.identity.properties.aggregateVersion.value;
    const updatedVersion = new AggregateVersion(currentVersion + 1);
    const transitionId = this.identifiers.next();

    const updatedIdentity = new Identity({
      ...snapshot.identity.properties,
      identityState: 'DELETED',
      deletionRequestedAt: now,
      aggregateVersion: updatedVersion,
      updatedAt: now,
    });

    const stateTransition = new IdentityStateTransition({
      identityStateTransitionId: transitionId,
      identityId,
      fromState: currentState,
      toState: 'DELETED',
      stateVersion: currentVersion + 1,
      transitionedAt: now,
      createdAt: now,
      reasonCode: command.reasonCode ?? 'USER_REQUESTED_DELETION',
    });

    await this.identityRepository.save(
      {
        identity: updatedIdentity,
        identifiers: snapshot.identifiers,
        credentials: snapshot.credentials,
        classificationAssignments: snapshot.classificationAssignments,
        mfaEnrollments: snapshot.mfaEnrollments,
        mfaFactors: snapshot.mfaFactors,
        recoveryCodeSets: [],
        recoveryCodes: [],
        trustedDevices: [],
        credentialHistoryToAppend: [],
        passwordHistoryToAppend: [],
        stateTransitionsToAppend: [stateTransition],
      },
      snapshot.identity.properties.aggregateVersion,
    );

    await this.revokeAllSessions(identityId, command, 'IDENTITY_DELETION_REQUESTED');
    return this.mapToProfileResult({ ...snapshot, identity: updatedIdentity });
  }

  /**
   * M01-CRED-001. Changes the active PASSWORD credential after re-authenticating
   * the caller against the current credential hash.
   *
   * Enforces the approved password policy (length bounds and reuse history):
   * the new password must differ from the current password and from the most
   * recent configured number of historical password hashes. The change commits
   * atomically (version-guarded): the current credential transitions to
   * REPLACED, a new ACTIVE credential is issued, an immutable Credential History
   * REPLACED event is appended and the previous hash is appended to the
   * Password History for future reuse checks. Every active Session of the
   * Identity is then revoked (Password Change is an approved revocation
   * trigger), so the caller must authenticate again with the new password.
   *
   * The revocation runs in a second transaction after the change commits. If it
   * fails, the change is already durable and the caller must re-authenticate
   * with the new password (the current credential is REPLACED); the endpoint
   * surfaces the revocation failure rather than reporting success.
   */
  public async changePassword(identityId: UuidV7, command: ChangePasswordCommand): Promise<void> {
    const snapshot = await this.identityRepository.findAuthenticationById(identityId);
    if (snapshot === null) throw new CredentialError('CURRENT_CREDENTIAL_INVALID');
    if (
      snapshot.identity.properties.identityState !== 'ACTIVE' ||
      snapshot.identity.properties.verificationState !== 'VERIFIED'
    ) {
      throw new CredentialError('CURRENT_CREDENTIAL_INVALID');
    }
    if (snapshot.identity.properties.aggregateVersion.value !== command.expectedIdentityVersion) {
      throw new CredentialError('RESOURCE_STATE_CONFLICT');
    }
    const current = snapshot.credentials.find(
      (candidate) =>
        candidate.properties.credentialType === 'PASSWORD' &&
        candidate.properties.credentialState === 'ACTIVE',
    );
    if (current === undefined) throw new CredentialError('CURRENT_CREDENTIAL_INVALID');
    const reauthenticated = await this.passwordHashing.verifyForAuthentication(
      command.currentPassword,
      current.properties.protectedSecret.value,
    );
    if (!reauthenticated) throw new CredentialError('CURRENT_CREDENTIAL_INVALID');

    if (
      command.currentPassword === command.newPassword ||
      !this.isWithinPasswordPolicy(command.newPassword)
    ) {
      throw new CredentialError('PASSWORD_POLICY_FAILED');
    }
    const history = await this.identityRepository.findPasswordHistory(
      identityId,
      this.options.passwordHistoryDepth,
    );
    if (await this.isPasswordReused(command.newPassword, current, history)) {
      throw new CredentialError('PASSWORD_POLICY_FAILED');
    }

    const now = this.clock.now();
    const newHash = await this.passwordHashing.hash(command.newPassword);
    const nextVersion = new AggregateVersion(
      snapshot.identity.properties.aggregateVersion.value + 1,
    );
    const updatedIdentity = new Identity({
      ...snapshot.identity.properties,
      aggregateVersion: nextVersion,
      updatedAt: now,
    });
    const replaced = new Credential({
      ...current.properties,
      credentialState: 'REPLACED',
      replacedAt: now,
      updatedAt: now,
    });
    const issued = new Credential({
      credentialId: this.identifiers.next(),
      identityId,
      credentialType: 'PASSWORD',
      credentialVersion: current.properties.credentialVersion + 1,
      credentialState: 'ACTIVE',
      protectedSecret: new ProtectedValue(newHash),
      protectionKeyVersion: 'v1',
      createdAt: now,
      updatedAt: now,
    });
    const credentials = [
      ...snapshot.credentials.map((credential) =>
        credential.properties.credentialId.value === current.properties.credentialId.value
          ? replaced
          : credential,
      ),
      issued,
    ];

    const credentialHistory = new CredentialHistoryRecord({
      credentialHistoryId: this.identifiers.next(),
      identityId,
      credentialType: 'PASSWORD',
      credentialVersion: current.properties.credentialVersion + 1,
      protectedHistoricalValue: current.properties.protectedSecret,
      eventType: 'REPLACED',
      createdAt: now,
      sourceCredentialId: current.properties.credentialId,
    });
    const passwordHistory = new PasswordHistoryRecord({
      passwordHistoryId: this.identifiers.next(),
      identityId,
      passwordHash: current.properties.protectedSecret,
      hashAlgorithmReference: PASSWORD_HASH_ALGORITHM_REFERENCE,
      createdAt: now,
    });

    try {
      await this.identityRepository.save(
        {
          identity: updatedIdentity,
          identifiers: snapshot.identifiers,
          credentials,
          classificationAssignments: snapshot.classificationAssignments,
          mfaEnrollments: snapshot.mfaEnrollments,
          mfaFactors: snapshot.mfaFactors,
          recoveryCodeSets: [],
          recoveryCodes: [],
          trustedDevices: [],
          credentialHistoryToAppend: [credentialHistory],
          passwordHistoryToAppend: [passwordHistory],
          stateTransitionsToAppend: [],
        },
        snapshot.identity.properties.aggregateVersion,
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new CredentialError('RESOURCE_STATE_CONFLICT');
      }
      throw error;
    }

    await this.sessionRepository.revokeAllSessions({
      identityId,
      authorizingSessionId: command.authorizingSessionId,
      expectedAuthorizingSessionVersion: command.expectedAuthorizingSessionVersion,
      revokedAt: now,
      revocationReason: 'PASSWORD_CHANGED',
    });
  }

  private isWithinPasswordPolicy(password: string): boolean {
    return (
      password.length >= this.options.minimumPasswordLength &&
      password.length <= this.options.maximumPasswordLength
    );
  }

  private async isPasswordReused(
    candidatePassword: string,
    current: Credential,
    history: readonly PasswordHistoryRecord[],
  ): Promise<boolean> {
    if (
      await this.passwordHashing.verify(candidatePassword, current.properties.protectedSecret.value)
    ) {
      return true;
    }
    for (const record of history) {
      if (
        await this.passwordHashing.verify(candidatePassword, record.properties.passwordHash.value)
      ) {
        return true;
      }
    }
    return false;
  }

  private async revokeAllSessions(
    identityId: UuidV7,
    command: IdentityLifecycleCommand,
    defaultRevocationReason: string,
  ): Promise<void> {
    if (
      command.authorizingSessionId === undefined ||
      command.expectedAuthorizingSessionVersion === undefined
    ) {
      return;
    }
    await this.sessionRepository.revokeAllSessions({
      identityId,
      authorizingSessionId: command.authorizingSessionId,
      expectedAuthorizingSessionVersion: command.expectedAuthorizingSessionVersion,
      revokedAt: this.clock.now(),
      revocationReason: command.reasonCode ?? defaultRevocationReason,
    });
  }

  private mapToProfileResult(snapshot: IdentityAuthenticationSnapshot): IdentityProfileResult {
    const { properties } = snapshot.identity;
    const primaryId =
      snapshot.identifiers.find((i) => i.properties.isPrimary) ?? snapshot.identifiers[0];
    const classification = snapshot.classificationAssignments.find(
      (c) => c.properties.assignmentState === 'EFFECTIVE',
    );

    return {
      identityId: properties.identityId.value,
      identityState: properties.identityState,
      verificationState: properties.verificationState,
      aggregateVersion: properties.aggregateVersion.value,
      classification: classification?.properties.classification ?? 'STANDARD_AUTHENTICATION',
      primaryIdentifier: primaryId
        ? {
            identifierType: primaryId.properties.identifierType,
            verificationState: primaryId.properties.verificationState,
          }
        : undefined,
      createdAt: properties.createdAt,
      updatedAt: properties.updatedAt,
      disabledAt: properties.disabledAt,
      anonymizedAt: properties.anonymizedAt,
      deletionRequestedAt: properties.deletionRequestedAt,
    };
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

/** Argon2id v1.3 encodes as $argon2id$v=19$ in the standard encoded hash. */
const PASSWORD_HASH_ALGORITHM_REFERENCE = 'argon2id-v19';
