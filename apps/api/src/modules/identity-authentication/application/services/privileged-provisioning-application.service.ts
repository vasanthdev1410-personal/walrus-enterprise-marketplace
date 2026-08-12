import { Identity } from '../../domain/identity/entities/identity';
import { IdentityIdentifier } from '../../domain/identity/entities/identity-identifier';
import { IdentityStateTransition } from '../../domain/identity/entities/identity-state-transition';
import { AuthenticationSecurityClassificationAssignment } from '../../domain/identity/entities/authentication-security-classification-assignment';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import type { AuthenticationSecurityClassification } from '../../domain/identity/value-objects/authentication-security-classification';
import { canonicalizeIdentifier } from '../../domain/identity/value-objects/canonicalize-identifier';
import type { IdentifierType } from '../../domain/identity/value-objects/identifier-type';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { ProvisioningError } from '../errors/provisioning.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { BootstrapAuthorizationPort } from '../ports/bootstrap-authorization.port';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import type { PrivilegedProvisioningAuthorizationPort } from '../ports/privileged-provisioning-authorization.port';
import type { VerifiedWorkloadContextV2 } from '../ports/verified-workload-context';

/**
 * M01-ADM-001. Provision a privileged Identity (Admin) through the approved
 * internal service boundary. The request is INTERNAL_SERVICE: a current
 * service authorization decision is obtained through the narrow
 * PrivilegedProvisioningAuthorizationPort at decision time
 * (AUTHORIZATION_DENIED otherwise — an ordinary Session alone never provisions
 * a privileged Identity). Only the PRIVILEGED_ADMIN_AUTHENTICATION
 * authentication-security classification is permitted here:
 * SUPER_ADMIN_AUTHENTICATION is applied exclusively by the controlled bootstrap
 * (M01-ADM-002), so no hidden Super Admin can be created through this route.
 * The provisioned Identity starts PENDING_VERIFICATION with an UNVERIFIED
 * identifier and no credential; verification, MFA enrollment and Identity
 * activation complete through the approved Module 01 workflows afterwards.
 */
export interface ProvisionPrivilegedIdentityCommand {
  /** The service identity performing the internal call. */
  readonly actorIdentityId?: UuidV7;
  readonly workload?: VerifiedWorkloadContextV2;
  readonly provisioningAssertionDigest?: string;
  readonly provisioningReference: string;
  readonly identifierType: IdentifierType;
  readonly identifier: string;
  readonly targetAuthenticationSecurityClassification: AuthenticationSecurityClassification;
}

export interface ProvisionPrivilegedIdentityResult {
  /** Unique identifier of the created provisioning operation (the Identity). */
  readonly operationId: string;
  /** Identity lifecycle state after provisioning. */
  readonly state: string;
}

/**
 * M01-ADM-002. Bootstrap the initial universal Identity associated with Super
 * Admin access. The route is BOOTSTRAP_CONTROLLED: availability is decided by
 * the narrow BootstrapAuthorizationPort at decision time (BOOTSTRAP_UNAVAILABLE
 * until an approved controlled bootstrap contract is integrated). The
 * SUPER_ADMIN_AUTHENTICATION classification is always applied server-side and
 * is never client-selectable; Module 01 bootstrap never grants Super Admin
 * authorization (Module 02 owns the role). The Identity starts
 * PENDING_VERIFICATION with an UNVERIFIED identifier and no credential.
 */
export interface BootstrapSuperAdminIdentityCommand {
  readonly bootstrapEvidence: string;
  readonly identifierType: IdentifierType;
  readonly identifier: string;
  readonly workload?: VerifiedWorkloadContextV2;
  readonly bootstrapAssertionDigest?: string;
}

export interface BootstrapSuperAdminIdentityResult {
  readonly identityId: string;
  readonly bootstrapState: string;
}

export interface ProvisioningApplicationOptions {
  readonly environment: string;
}

/** Provisioned Identities are created pending verification (documented state). */
const PROVISIONED_IDENTITY_STATE = 'PENDING_VERIFICATION';

export class PrivilegedProvisioningApplicationService {
  public constructor(
    private readonly identities: IdentityRepository,
    private readonly identifierLookup: IdentifierLookupCryptographicPort,
    private readonly provisioningAuthorization: PrivilegedProvisioningAuthorizationPort,
    private readonly bootstrapAuthorization: BootstrapAuthorizationPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
    private readonly options: ProvisioningApplicationOptions,
  ) {}

  public async provisionPrivilegedIdentity(
    command: ProvisionPrivilegedIdentityCommand,
  ): Promise<ProvisionPrivilegedIdentityResult> {
    if (command.targetAuthenticationSecurityClassification !== 'PRIVILEGED_ADMIN_AUTHENTICATION') {
      // Super Admin identities are created only by the controlled bootstrap;
      // no other classification may be requested through this internal route.
      throw new ProvisioningError('CLASSIFICATION_NOT_PERMITTED');
    }
    const authorization = await this.provisioningAuthorization.authorizeProvisioning({
      provisioningReference: command.provisioningReference,
      ...(command.actorIdentityId === undefined
        ? {}
        : { actorIdentityId: command.actorIdentityId }),
      ...(command.workload === undefined ? {} : { workload: command.workload }),
      ...(command.provisioningAssertionDigest === undefined
        ? {}
        : { provisioningAssertionDigest: command.provisioningAssertionDigest }),
    });
    if (!authorization.authorized) {
      throw new ProvisioningError('AUTHORIZATION_DENIED');
    }

    if (
      command.workload !== undefined &&
      (authorization.intendedIdentityId === undefined ||
        authorization.operationId === undefined ||
        authorization.authorizationReference === undefined)
    )
      throw new ProvisioningError('AUTHORIZATION_DENIED');
    const identityId = authorization.intendedIdentityId ?? this.identifiers.next();
    try {
      await this.insertProvisionedIdentity({
        identityId,
        identifierType: command.identifierType,
        identifier: command.identifier,
        classification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        sourceContractReference: command.provisioningReference,
        reasonCode: 'PRIVILEGED_PROVISIONING',
      });
      if (authorization.operationId && authorization.authorizationReference)
        await this.provisioningAuthorization.completeProvisioning?.({
          operationId: authorization.operationId,
          identityId,
          authorizationReference: authorization.authorizationReference,
        });
    } catch (error) {
      if (authorization.operationId)
        await this.provisioningAuthorization.markProvisioningFailure?.({
          operationId: authorization.operationId,
          reasonCode: 'MODULE_01_PREPARATION_FAILED',
        });
      throw error;
    }

    return {
      operationId: identityId.value,
      state: PROVISIONED_IDENTITY_STATE,
    };
  }

  public async bootstrapSuperAdminIdentity(
    command: BootstrapSuperAdminIdentityCommand,
  ): Promise<BootstrapSuperAdminIdentityResult> {
    const bootstrap = await this.bootstrapAuthorization.authorizeBootstrap({
      bootstrapEvidence: command.bootstrapEvidence,
      ...(command.workload === undefined ? {} : { workload: command.workload }),
      ...(command.bootstrapAssertionDigest === undefined
        ? {}
        : { bootstrapAssertionDigest: command.bootstrapAssertionDigest }),
    });
    if (!bootstrap.available) {
      throw new ProvisioningError('BOOTSTRAP_UNAVAILABLE');
    }

    if (
      command.workload !== undefined &&
      (bootstrap.intendedIdentityId === undefined ||
        bootstrap.operationId === undefined ||
        bootstrap.authorizationReference === undefined)
    )
      throw new ProvisioningError('BOOTSTRAP_UNAVAILABLE');
    const identityId = bootstrap.intendedIdentityId ?? this.identifiers.next();
    try {
      await this.insertProvisionedIdentity({
        identityId,
        identifierType: command.identifierType,
        identifier: command.identifier,
        // The Super Admin classification is server-fixed by the bootstrap and is
        // never client-selectable; Module 02 still owns the Super Admin role.
        classification: 'SUPER_ADMIN_AUTHENTICATION',
        sourceContractReference: command.bootstrapEvidence,
        reasonCode: 'SUPER_ADMIN_BOOTSTRAP',
      });
      if (bootstrap.operationId && bootstrap.authorizationReference)
        await this.bootstrapAuthorization.completeBootstrapPreparation?.({
          operationId: bootstrap.operationId,
          identityId,
          authorizationReference: bootstrap.authorizationReference,
        });
    } catch (error) {
      if (bootstrap.operationId)
        await this.bootstrapAuthorization.markBootstrapFailure?.({
          operationId: bootstrap.operationId,
          reasonCode: 'MODULE_01_PREPARATION_FAILED',
        });
      throw error;
    }

    return {
      identityId: identityId.value,
      bootstrapState: PROVISIONED_IDENTITY_STATE,
    };
  }

  private async insertProvisionedIdentity(options: {
    readonly identityId: UuidV7;
    readonly identifierType: IdentifierType;
    readonly identifier: string;
    readonly classification: AuthenticationSecurityClassification;
    readonly sourceContractReference: string;
    readonly reasonCode: string;
  }): Promise<void> {
    let canonicalValue: string;
    try {
      canonicalValue = canonicalizeIdentifier(options.identifierType, options.identifier);
    } catch {
      throw new ProvisioningError('IDENTIFIER_INVALID');
    }
    const lookups = this.identifierLookup.createLookupsForResolution({
      environment: this.options.environment,
      identifierType: options.identifierType,
      canonicalValue,
    });
    const lookupProtectedValues = lookups.map((value) => new ProtectedValue(value));
    const existingSnapshot = await this.identities.findByIdentifierLookups(
      options.identifierType,
      lookupProtectedValues,
    );
    if (existingSnapshot !== null) {
      throw new ProvisioningError('IDENTIFIER_ALREADY_REGISTERED');
    }

    const now = this.clock.now();
    const identity = new Identity({
      identityId: options.identityId,
      identityState: PROVISIONED_IDENTITY_STATE,
      verificationState: 'PENDING_VERIFICATION',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    const identifier = new IdentityIdentifier({
      identifierId: this.identifiers.next(),
      identityId: options.identityId,
      identifierType: options.identifierType,
      protectedNormalizedValue: new ProtectedValue(canonicalValue),
      lookupDigest: new ProtectedValue(lookups[0] ?? canonicalValue),
      lookupKeyVersion: 'v1',
      verificationState: 'UNVERIFIED',
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
    });
    const classificationAssignment = new AuthenticationSecurityClassificationAssignment({
      classificationAssignmentId: this.identifiers.next(),
      identityId: options.identityId,
      classification: options.classification,
      effectiveAt: now,
      assignmentState: 'EFFECTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
      sourceContractReference: options.sourceContractReference,
      reasonCode: options.reasonCode,
    });
    const stateTransition = new IdentityStateTransition({
      identityStateTransitionId: this.identifiers.next(),
      identityId: options.identityId,
      toState: PROVISIONED_IDENTITY_STATE,
      stateVersion: 1,
      transitionedAt: now,
      createdAt: now,
      reasonCode: options.reasonCode,
      sourceReference: options.sourceContractReference,
    });

    try {
      await this.identities.insert({
        identity,
        identifiers: [identifier],
        credentials: [],
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
      // Two concurrent provisioning commands may both pass the ownership check;
      // the unique [identifierType, lookupDigest] constraint is authoritative.
      if (isUniqueConstraintViolation(error)) {
        throw new ProvisioningError('IDENTIFIER_ALREADY_REGISTERED');
      }
      throw error;
    }
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
