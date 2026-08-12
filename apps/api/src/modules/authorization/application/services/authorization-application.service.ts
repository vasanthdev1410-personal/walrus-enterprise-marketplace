import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { AuthorizationMutationPort } from '../ports/authorization-mutation.port';
import type { PrivilegedEligibilityPort } from '../ports/privileged-eligibility.port';
import { OptimisticConcurrencyError } from '../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { currentCorrelationId } from '../../../identity-authentication/presentation/http-contract';
import {
  CLOCK,
  UUID_V7_GENERATOR,
} from '../../../identity-authentication/identity-authentication.tokens';
import {
  AUTHORIZATION_DECISION_REPOSITORY,
  AUTHORIZATION_MUTATION,
  IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
} from '../../authorization.tokens';
import { AuthorizationDecisionEngine } from '../../domain/authorization-decision-engine';
import type { AuthorizationDecision } from '../../domain/authorization-decision';
import { AuthorizationDecisionRecord } from '../../domain/entities/authorization-decision-record';
import { IdentityRoleAssignment } from '../../domain/entities/identity-role-assignment';
import type { AuthorizationDecisionRepository } from '../../domain/repositories/authorization-decision-repository';
import type { IdentityRoleAssignmentRepository } from '../../domain/repositories/identity-role-assignment-repository';
import { RoleCatalog } from '../../domain/role-catalog';
import type { Role } from '../../domain/entities/role';
import type { RoleName } from '../../domain/value-objects/role-name';
import type { ResourceClassification } from '../../domain/value-objects/resource-classification';
import { AuthorizationError } from '../errors/authorization.error';

export interface AuthorizeCommand {
  readonly subjectIdentityId: UuidV7;
  readonly permissionId: string;
  readonly resourceClassification?: ResourceClassification;
  readonly sessionIdentifier?: string;
}

export interface AssignRoleCommand {
  readonly targetIdentityId: UuidV7;
  readonly roleName: RoleName;
  /** The authenticated identity performing the assignment (server-bound). */
  readonly assignedByIdentityId: UuidV7;
}

export interface RevokeRoleCommand {
  readonly assignmentId: UuidV7;
  readonly revokedByIdentityId: UuidV7;
}

/**
 * Part 6.1 §5 / Part 6.2 §9 / Part 6.5 §22 (Module 02 source material).
 * Application layer for authorization decisions and centrally-managed role
 * assignment. Every decision and every role event is recorded to the
 * append-only audit store. Role assignment is server-controlled: the target
 * role must be ACTIVE (never RETIRED), the actor must hold the
 * `authorization.role.assign` permission (enforced by the guard) AND an
 * ACTIVE role whose administrative scope covers the target role (Part 6.2 §7).
 * Only a SUPER_ADMIN may assign the SUPER_ADMIN role; no other role can assign
 * itself, preventing privilege escalation.
 */
@Injectable()
export class AuthorizationApplicationService {
  public constructor(
    private readonly engine: AuthorizationDecisionEngine,
    private readonly roleCatalog: RoleCatalog,
    @Inject(IDENTITY_ROLE_ASSIGNMENT_REPOSITORY)
    private readonly assignments: IdentityRoleAssignmentRepository,
    @Inject(AUTHORIZATION_DECISION_REPOSITORY)
    private readonly decisions: AuthorizationDecisionRepository,
    @Inject(AUTHORIZATION_MUTATION)
    private readonly mutations: AuthorizationMutationPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(UUID_V7_GENERATOR) private readonly identifiers: UuidV7GenerationPort,
    private readonly privilegedEligibility?: PrivilegedEligibilityPort,
  ) {}

  public async authorize(command: AuthorizeCommand): Promise<AuthorizationDecision> {
    const now = this.clock.now();
    const activeAssignments = await this.assignments.findActiveByIdentityId(
      command.subjectIdentityId,
    );
    const eligibleAssignments = [];
    for (const assignment of activeAssignments) {
      const role = assignment.properties.roleName;
      if (
        (role === 'ADMIN' || role === 'SUPER_ADMIN') &&
        (this.privilegedEligibility === undefined ||
          !(await this.privilegedEligibility.isEligible(command.subjectIdentityId, role)))
      )
        continue;
      eligibleAssignments.push(assignment);
    }
    const decision = this.engine.evaluate(
      {
        decisionInstanceId: this.identifiers.next(),
        subjectIdentityId: command.subjectIdentityId,
        permissionId: command.permissionId,
        ...(command.resourceClassification === undefined
          ? {}
          : { resourceClassification: command.resourceClassification }),
      },
      eligibleAssignments,
    );
    const correlationId = currentCorrelationId();
    await this.decisions.insert(
      new AuthorizationDecisionRecord({
        authorizationReference: decision.properties.authorizationReference,
        actorIdentityId: command.subjectIdentityId,
        subjectIdentityId: command.subjectIdentityId,
        permissionId: command.permissionId,
        ...(command.resourceClassification === undefined
          ? {}
          : { resourceClassification: command.resourceClassification }),
        decisionOutcome: decision.properties.outcome,
        ...(decision.properties.denialReason === undefined
          ? {}
          : { denialReason: decision.properties.denialReason }),
        ...(command.sessionIdentifier === undefined
          ? {}
          : { sessionIdentifier: command.sessionIdentifier }),
        ...(correlationId === undefined ? {} : { correlationId }),
        decidedAt: now,
        createdAt: now,
      }),
    );
    return decision;
  }

  public async assignRole(command: AssignRoleCommand): Promise<IdentityRoleAssignment> {
    const now = this.clock.now();
    const role = this.roleCatalog.findByName(command.roleName);
    if (role === undefined) {
      throw new AuthorizationError('ROLE_UNKNOWN');
    }
    if (role.properties.state === 'RETIRED') {
      throw new AuthorizationError('ROLE_RETIRED');
    }
    if (role.properties.state !== 'ACTIVE') {
      throw new AuthorizationError('ROLE_NOT_ACTIVE');
    }
    // M02-M4 owns every privileged assignment. The generic M3 administration
    // endpoint cannot bypass readiness, quorum, PRV1/BSV1 or eligibility by
    // directly creating ADMIN/SUPER_ADMIN episodes.
    if (command.roleName === 'ADMIN' || command.roleName === 'SUPER_ADMIN') {
      throw new AuthorizationError('TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE');
    }

    const actorAssignments = await this.assignments.findActiveByIdentityId(
      command.assignedByIdentityId,
    );
    const managesTarget = actorAssignments.some((actor) => {
      if (actor.properties.assignmentState !== 'ACTIVE') {
        return false;
      }
      if (actor.properties.roleName === command.roleName) {
        // Only the top role may assign itself; anything else is escalation.
        return actor.properties.roleName === 'SUPER_ADMIN';
      }
      return this.roleCatalog.hierarchy().manages(actor.properties.roleName, command.roleName);
    });
    if (!managesTarget) {
      throw new AuthorizationError('TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE');
    }

    const targetAssignments = await this.assignments.findByIdentityId(command.targetIdentityId);
    if (
      targetAssignments.some(
        (existing) =>
          existing.properties.assignmentState === 'ACTIVE' &&
          existing.properties.roleName === command.roleName,
      )
    ) {
      throw new AuthorizationError('ALREADY_ASSIGNED');
    }

    const assignment = new IdentityRoleAssignment({
      assignmentId: this.identifiers.next(),
      identityId: command.targetIdentityId,
      roleName: command.roleName,
      assignmentState: 'ACTIVE',
      assignedByIdentityId: command.assignedByIdentityId,
      assignedAt: now,
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    await this.mutations.assignRoleWithAudit(
      assignment,
      this.createRoleEvent(
        command.assignedByIdentityId,
        command.targetIdentityId,
        'authorization.role.assign',
        now,
      ),
    );
    return assignment;
  }

  public async revokeRole(command: RevokeRoleCommand): Promise<IdentityRoleAssignment> {
    const now = this.clock.now();
    const current = await this.assignments.findById(command.assignmentId);
    if (current === null) {
      throw new AuthorizationError('ASSIGNMENT_NOT_FOUND');
    }
    if (current.properties.assignmentState === 'REVOKED') {
      throw new AuthorizationError('ALREADY_REVOKED');
    }
    const actorAssignments = await this.assignments.findActiveByIdentityId(
      command.revokedByIdentityId,
    );
    const managesTarget = actorAssignments.some(
      (actor) =>
        actor.properties.assignmentState === 'ACTIVE' &&
        this.roleCatalog
          .hierarchy()
          .manages(actor.properties.roleName, current.properties.roleName),
    );
    if (!managesTarget) {
      throw new AuthorizationError('TARGET_OUTSIDE_ADMINISTRATIVE_SCOPE');
    }
    const revoked = new IdentityRoleAssignment({
      ...current.properties,
      assignmentState: 'REVOKED',
      revokedByIdentityId: command.revokedByIdentityId,
      revokedAt: now,
      aggregateVersion: new AggregateVersion(current.properties.aggregateVersion.value + 1),
      updatedAt: now,
    });
    try {
      await this.mutations.revokeRoleWithAudit(
        revoked,
        this.createRoleEvent(
          command.revokedByIdentityId,
          current.properties.identityId,
          'authorization.role.revoke',
          now,
        ),
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new AuthorizationError('STALE_VERSION');
      }
      throw error;
    }
    return revoked;
  }

  public async listIdentityRoleAssignments(
    identityId: UuidV7,
  ): Promise<readonly IdentityRoleAssignment[]> {
    return this.assignments.findByIdentityId(identityId);
  }

  public listRoleCatalog(): readonly Role[] {
    return this.roleCatalog.all();
  }

  /**
   * Part 6.5 §22. Records role assignment/revocation events in the append-only
   * authorization audit store. The correlation identifier ties the event to
   * the originating request; no secrets are ever recorded.
   */
  private createRoleEvent(
    actorIdentityId: UuidV7,
    targetIdentityId: UuidV7,
    permissionId: string,
    now: Date,
  ): AuthorizationDecisionRecord {
    const correlationId = currentCorrelationId();
    return new AuthorizationDecisionRecord({
      authorizationReference: `azr:${createHash('sha256')
        .update(
          `${this.identifiers.next().value}|${permissionId}|${actorIdentityId.value}|${targetIdentityId.value}|${now.toISOString()}`,
        )
        .digest('hex')
        .slice(0, 24)}`,
      actorIdentityId,
      subjectIdentityId: targetIdentityId,
      permissionId,
      decisionOutcome: 'GRANTED',
      ...(correlationId === undefined ? {} : { correlationId }),
      decidedAt: now,
      createdAt: now,
    });
  }
}
