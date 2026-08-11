import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { AuthenticationSecurityClassificationAssignment } from '../../domain/identity/entities/authentication-security-classification-assignment';
import { Identity } from '../../domain/identity/entities/identity';
import type { IdentityRepository } from '../../domain/identity/repositories/identity-repository';
import type { AuthenticationSecurityClassification } from '../../domain/identity/value-objects/authentication-security-classification';
import { ClassificationTransitionError } from '../errors/classification-transition.error';
import type { ClockPort, UuidV7GenerationPort } from '../ports/application-runtime.port';
import type { ClassificationTransitionCoordinationPort } from '../ports/classification-transition-coordination.port';

export interface TransitionClassificationCommand {
  /** The service identity performing the internal call. */
  readonly actorIdentityId: UuidV7;
  readonly targetIdentityId: UuidV7;
  readonly targetAuthenticationSecurityClassification: AuthenticationSecurityClassification;
  readonly reasonCode: string;
  readonly sourceContractReference: string;
  readonly expectedIdentityVersion: number;
}

export interface ClassificationTransitionResult {
  readonly identityId: string;
  readonly authenticationSecurityClassification: AuthenticationSecurityClassification;
  readonly version: number;
}

/**
 * M01-CLS-001. Authentication-security-classification transition through the
 * approved internal coordination contract.
 *
 * The request is INTERNAL_SERVICE: the versioned source contract reference is
 * validated through the narrow ClassificationTransitionCoordinationPort at
 * decision time (CONTRACT_INVALID when no approved contract is present — a
 * service Session alone never changes a classification), the identity version
 * precondition and the version-guarded aggregate write reject stale writes,
 * and the current EFFECTIVE assignment is atomically ENDED while a new
 * EFFECTIVE assignment for the target classification is created in the same
 * write. A classification only selects authentication controls and never
 * grants permissions; no Module 02 role, permission or authorization internals
 * are read, stored or exposed.
 */
export class ClassificationTransitionApplicationService {
  public constructor(
    private readonly identities: IdentityRepository,
    private readonly coordinationContract: ClassificationTransitionCoordinationPort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
  ) {}

  public async transitionClassification(
    command: TransitionClassificationCommand,
  ): Promise<ClassificationTransitionResult> {
    const snapshot = await this.identities.findAuthenticationById(command.targetIdentityId);
    if (snapshot === null) {
      throw new ClassificationTransitionError('RESOURCE_NOT_AVAILABLE');
    }
    const identity = snapshot.identity.properties;
    if (identity.aggregateVersion.value !== command.expectedIdentityVersion) {
      throw new ClassificationTransitionError('RESOURCE_STATE_CONFLICT');
    }

    const contract = await this.coordinationContract.validateContract({
      actorIdentityId: command.actorIdentityId,
      targetIdentityId: command.targetIdentityId,
      targetAuthenticationSecurityClassification:
        command.targetAuthenticationSecurityClassification,
      sourceContractReference: command.sourceContractReference,
    });
    if (!contract.contractValid) {
      throw new ClassificationTransitionError('CONTRACT_INVALID');
    }

    const current = snapshot.classificationAssignments.find(
      (assignment) => assignment.properties.assignmentState === 'EFFECTIVE',
    );
    if (current?.properties.classification === command.targetAuthenticationSecurityClassification) {
      // No-op transition: the classification already equals the target. Fail
      // closed on the contract instead of silently accepting a meaningless
      // privileged call; the caller must not obtain a fresh privilege grant.
      throw new ClassificationTransitionError('CONTRACT_INVALID');
    }

    const now = this.clock.now();
    const currentVersion = identity.aggregateVersion.value;
    const updatedVersion = new AggregateVersion(currentVersion + 1);
    const updatedIdentity = new Identity({
      ...identity,
      aggregateVersion: updatedVersion,
      updatedAt: now,
    });

    const endedAssignments = snapshot.classificationAssignments.map((assignment) =>
      assignment.properties.assignmentState === 'EFFECTIVE'
        ? new AuthenticationSecurityClassificationAssignment({
            ...assignment.properties,
            assignmentState: 'ENDED',
            endedAt: now,
            aggregateVersion: new AggregateVersion(
              assignment.properties.aggregateVersion.value + 1,
            ),
            updatedAt: now,
          })
        : assignment,
    );
    const newAssignment = new AuthenticationSecurityClassificationAssignment({
      classificationAssignmentId: this.identifiers.next(),
      identityId: command.targetIdentityId,
      classification: command.targetAuthenticationSecurityClassification,
      effectiveAt: now,
      assignmentState: 'EFFECTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
      sourceContractReference: command.sourceContractReference,
      reasonCode: command.reasonCode,
    });

    const codeSets = await this.identities.findRecoveryCodeSets(command.targetIdentityId);
    try {
      await this.identities.save(
        {
          identity: updatedIdentity,
          identifiers: snapshot.identifiers,
          credentials: snapshot.credentials,
          classificationAssignments: [...endedAssignments, newAssignment],
          mfaEnrollments: snapshot.mfaEnrollments,
          mfaFactors: snapshot.mfaFactors,
          recoveryCodeSets: codeSets?.recoveryCodeSets ?? [],
          recoveryCodes: codeSets?.recoveryCodes ?? [],
          trustedDevices: snapshot.trustedDevices ?? [],
          credentialHistoryToAppend: [],
          passwordHistoryToAppend: [],
          stateTransitionsToAppend: [],
        },
        identity.aggregateVersion,
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new ClassificationTransitionError('RESOURCE_STATE_CONFLICT');
      }
      throw error;
    }

    return {
      identityId: command.targetIdentityId.value,
      authenticationSecurityClassification: command.targetAuthenticationSecurityClassification,
      version: updatedVersion.value,
    };
  }
}
