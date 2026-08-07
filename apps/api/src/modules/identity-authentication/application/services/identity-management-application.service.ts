import { AuthenticationSecurityClassificationAssignment } from '../../domain/identity/entities/authentication-security-classification-assignment';
import { Credential } from '../../domain/identity/entities/credential';
import { Identity } from '../../domain/identity/entities/identity';
import { IdentityIdentifier } from '../../domain/identity/entities/identity-identifier';
import { IdentityStateTransition } from '../../domain/identity/entities/identity-state-transition';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { AuthenticationSecurityClassification } from '../../domain/identity/value-objects/authentication-security-classification';
import { CanonicalEmailAddress } from '../../domain/identity/value-objects/canonical-email-address';
import { CanonicalMobileNumber } from '../../domain/identity/value-objects/canonical-mobile-number';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
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

export interface IdentityProfileResult {
  readonly identityId: string;
  readonly identityState: string;
  readonly verificationState: string;
  readonly aggregateVersion: number;
  readonly classification: string;
  readonly primaryIdentifier?: {
    readonly identifierType: string;
    readonly verificationState: string;
  } | undefined;
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

function canonicalizeIdentifier(type: IdentifierType, value: string): string {
  return type === 'EMAIL'
    ? new CanonicalEmailAddress(value).value
    : new CanonicalMobileNumber(value).value;
}

export class IdentityManagementApplicationService {
  public constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordHashing: PasswordHashingPort,
    private readonly identifierLookup: IdentifierLookupCryptographicPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly environment: string,
  ) {}

  public async register(command: RegisterIdentityCommand): Promise<IdentityProfileResult> {
    const canonicalValue = canonicalizeIdentifier(command.identifierType, command.identifier);
    const lookups = this.identifierLookup.createLookupsForResolution({
      environment: this.environment,
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
      aggregateVersion: new AggregateVersion(snapshot.identity.properties.aggregateVersion.value + 1),
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
    const primaryId = snapshot.identifiers.find((i) => i.properties.isPrimary) ?? snapshot.identifiers[0];
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
