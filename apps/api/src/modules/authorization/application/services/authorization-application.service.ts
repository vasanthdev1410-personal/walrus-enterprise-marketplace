import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { AuthorizationMutationPort } from '../ports/authorization-mutation.port';
import type { PrivilegedEligibilityPort } from '../ports/privileged-eligibility.port';
import type { SellerOwnershipResolverPort } from '../ports/seller-ownership-resolver.port';
import { OptimisticConcurrencyError } from '../../../identity-authentication/domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
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
import { AuthorizationDecision } from '../../domain/authorization-decision';
import { AuthorizationDecisionRecord } from '../../domain/entities/authorization-decision-record';
import { IdentityRoleAssignment } from '../../domain/entities/identity-role-assignment';
import type { AuthorizationDecisionRepository } from '../../domain/repositories/authorization-decision-repository';
import type { IdentityRoleAssignmentRepository } from '../../domain/repositories/identity-role-assignment-repository';
import { RoleCatalog } from '../../domain/role-catalog';
import type { Role } from '../../domain/entities/role';
import type { RoleName } from '../../domain/value-objects/role-name';
import type { ResourceClassification } from '../../domain/value-objects/resource-classification';
import type { AuthorizationDenialReason } from '../../domain/value-objects/authorization-denial-reason';
import { AuthorizationError } from '../errors/authorization.error';

export interface AuthorizeCommand {
  readonly subjectIdentityId: UuidV7;
  readonly permissionId: string;
  readonly resourceClassification?: ResourceClassification;
  readonly sessionIdentifier?: string;
  /**
   * WEMP-M03-AUTHZ-001 §4 (D-11). The target resource for an
   * organization-scoped permission (the seller profile). Never taken from
   * client claims alone: the ownership resolver validates it against the
   * authoritative association store. Ignored for non-org-scoped permissions.
   */
  readonly resourceReference?: UuidV7;
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

export interface AssignSellerRoleCommand {
  readonly targetIdentityId: UuidV7;
  readonly sellerProfileId: UuidV7;
  /**
   * The non-sensitive authority evidence reference tying the assignment to the
   * approved seller lifecycle (e.g. the approval transition/correlation
   * reference). Required for the control-plane provenance invariant.
   */
  readonly authorityEvidenceReference: string;
  readonly correlationId?: string;
}

export interface RevokeSellerRoleCommand {
  readonly identityId: UuidV7;
  /** The human revoker (e.g. the administering identity) when available. */
  readonly revokedByIdentityId?: UuidV7;
  readonly reasonReference?: string;
  readonly correlationId?: string;
}

export type SellerRoleAssignmentOutcome =
  | { readonly outcome: 'GRANTED' }
  | { readonly outcome: 'DENIED'; readonly reason: string }
  | { readonly outcome: 'FAILED'; readonly reason: string };

/**
 * The control-plane workload that drives the approved seller activation
 * lifecycle (WEMP-M03-SPEC-001 §4 APPROVED → ACTIVE gate). Assignments of
 * origin SELLER_LIFECYCLE carry this provenance in place of a human actor.
 */
export const SELLER_LIFECYCLE_WORKLOAD_IDENTITY = 'walrus.module-03.seller-lifecycle';

/** The seller states a SELLER role may legitimately be assigned in. */
const ASSIGNABLE_SELLER_STATES: ReadonlySet<string> = new Set([
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
]);

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
 *
 * D-11 (WEMP-M03-AUTHZ-001): `seller.*` self-service permissions are
 * organization-scoped through the ownership resolver; the SELLER role is
 * assigned by the control plane only after the approved lifecycle gate
 * (seller APPROVED) — fail closed, idempotent, with no partial SELLER access.
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
    private readonly sellerOwnershipResolver?: SellerOwnershipResolverPort,
  ) {}

  public async authorize(command: AuthorizeCommand): Promise<AuthorizationDecision> {
    const now = this.clock.now();
    if (this.engine.isOrganizationScoped(command.permissionId)) {
      return this.authorizeOrganizationScoped(command, now);
    }
    return this.evaluateAndRecord(command, now);
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

  /**
   * WEMP-M03-SPEC-001 §4 / D-11. The ONLY approved path for SELLER role
   * assignment in the seller lifecycle: control-plane, idempotent, and gated
   * on the ownership resolver confirming that the target identity holds an
   * ACTIVE association to a seller in a previously-approved state (APPROVED,
   * ACTIVE or SUSPENDED). Denies or fails closed on any missing/unknown state;
   * never creates partial SELLER access. A concurrent or duplicate activation
   * resolves to GRANTED (no duplicate assignment episodes).
   */
  public async assignSellerRoleForActivation(
    command: AssignSellerRoleCommand,
  ): Promise<SellerRoleAssignmentOutcome> {
    const now = this.clock.now();
    const role = this.roleCatalog.findByName('SELLER');
    if (role?.properties.state !== 'ACTIVE') {
      return { outcome: 'FAILED', reason: 'SELLER_ROLE_UNAVAILABLE' };
    }
    const resolver = this.sellerOwnershipResolver;
    if (resolver === undefined) {
      return { outcome: 'FAILED', reason: 'SCOPE_RESOLUTION_UNAVAILABLE' };
    }
    let scope;
    try {
      scope = await resolver.resolveSellerScope(command.targetIdentityId, command.sellerProfileId);
    } catch {
      return { outcome: 'FAILED', reason: 'SCOPE_RESOLUTION_UNAVAILABLE' };
    }
    if (scope === null) {
      return { outcome: 'DENIED', reason: 'SELLER_NOT_ASSOCIATED' };
    }
    if (!ASSIGNABLE_SELLER_STATES.has(scope.sellerState)) {
      return { outcome: 'DENIED', reason: 'SELLER_STATE_INELIGIBLE' };
    }
    const active = await this.assignments.findActiveByIdentityId(command.targetIdentityId);
    if (active.some((assignment) => assignment.properties.roleName === 'SELLER')) {
      // Duplicate/concurrent activation: already granted is a success.
      return { outcome: 'GRANTED' };
    }
    const assignment = new IdentityRoleAssignment({
      assignmentId: this.identifiers.next(),
      identityId: command.targetIdentityId,
      roleName: 'SELLER',
      assignmentState: 'ACTIVE',
      assignmentOriginType: 'SELLER_LIFECYCLE',
      assignedByWorkloadIdentity: SELLER_LIFECYCLE_WORKLOAD_IDENTITY,
      authorityEvidenceReference: command.authorityEvidenceReference,
      operationId: command.sellerProfileId,
      ...(isUuidV7String(command.correlationId)
        ? { auditCorrelationId: new UuidV7(command.correlationId) }
        : {}),
      assignedAt: now,
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    try {
      await this.mutations.assignRoleWithAudit(
        assignment,
        this.createSellerRoleEvent(command, assignment.properties.assignmentId, now),
      );
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        return { outcome: 'FAILED', reason: 'STALE_VERSION' };
      }
      return { outcome: 'FAILED', reason: 'ASSIGNMENT_FAILED' };
    }
    return { outcome: 'GRANTED' };
  }

  /**
   * WEMP-M03-SPEC-001 §4 / D-11. Revokes every ACTIVE SELLER assignment of an
   * identity (at most one per identity is possible under ALREADY_ASSIGNED).
   * Idempotent: nothing to revoke resolves to GRANTED. Used for explicit
   * revocation (terminal closure, administrative revocation) and as the
   * compensating action when a seller activation cannot commit atomically —
   * so a role is never left active for a seller that did not reach ACTIVE.
   */
  public async revokeSellerRole(
    command: RevokeSellerRoleCommand,
  ): Promise<SellerRoleAssignmentOutcome> {
    const now = this.clock.now();
    const active = await this.assignments.findActiveByIdentityId(command.identityId);
    const sellerAssignments = active.filter(
      (assignment) => assignment.properties.roleName === 'SELLER',
    );
    if (sellerAssignments.length === 0) {
      return { outcome: 'GRANTED' };
    }
    for (const assignment of sellerAssignments) {
      const revoked = new IdentityRoleAssignment({
        ...assignment.properties,
        assignmentState: 'REVOKED',
        ...(command.revokedByIdentityId === undefined
          ? {}
          : { revokedByIdentityId: command.revokedByIdentityId }),
        ...(command.reasonReference === undefined
          ? {}
          : { revocationReasonReference: command.reasonReference }),
        revokedAt: now,
        aggregateVersion: new AggregateVersion(assignment.properties.aggregateVersion.value + 1),
        updatedAt: now,
      });
      try {
        await this.mutations.revokeRoleWithAudit(
          revoked,
          this.createSellerRoleRevocationEvent(command, now),
        );
      } catch (error) {
        if (error instanceof OptimisticConcurrencyError) {
          return { outcome: 'FAILED', reason: 'STALE_VERSION' };
        }
        return { outcome: 'FAILED', reason: 'REVOCATION_FAILED' };
      }
    }
    return { outcome: 'GRANTED' };
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
   * Organization-scoped evaluation (WEMP-M03-AUTHZ-001 §4 / D-11). The
   * requested `seller.*` self-service permission is granted only when the
   * ownership resolver confirms an ACTIVE association of the subject to the
   * target seller and the seller is not in a terminal state. Every failure
   * mode denies with a distinct internal reason and is fully audited. Fail
   * closed: a missing resolver, a missing resource reference, an association
   * failure, or a terminal seller all deny.
   */
  private async authorizeOrganizationScoped(
    command: AuthorizeCommand,
    now: Date,
  ): Promise<AuthorizationDecision> {
    const resolver = this.sellerOwnershipResolver;
    if (resolver === undefined) {
      return this.denyAndRecord(command, now, 'SCOPE_RESOLUTION_UNAVAILABLE');
    }
    if (command.resourceReference === undefined) {
      return this.denyAndRecord(command, now, 'SCOPE_RESOURCE_MISSING');
    }
    let scope;
    try {
      scope = await resolver.resolveSellerScope(command.subjectIdentityId, command.resourceReference);
    } catch {
      return this.denyAndRecord(command, now, 'SCOPE_RESOLUTION_UNAVAILABLE');
    }
    if (scope === null) {
      return this.denyAndRecord(command, now, 'SCOPE_NOT_ASSOCIATED');
    }
    if (scope.sellerState === 'REJECTED' || scope.sellerState === 'CLOSED') {
      return this.denyAndRecord(command, now, 'SCOPE_SELLER_TERMINAL');
    }
    return this.evaluateAndRecord(command, now);
  }

  private async evaluateAndRecord(
    command: AuthorizeCommand,
    now: Date,
  ): Promise<AuthorizationDecision> {
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
        ...(command.resourceReference === undefined
          ? {}
          : {
              resourceType: 'seller.profile',
              resourceReference: command.resourceReference.value,
            }),
        ...(correlationId === undefined ? {} : { correlationId }),
        decidedAt: now,
        createdAt: now,
      }),
    );
    return decision;
  }

  private async denyAndRecord(
    command: AuthorizeCommand,
    now: Date,
    denialReason: AuthorizationDenialReason,
  ): Promise<AuthorizationDecision> {
    const decision = new AuthorizationDecision({
      outcome: 'DENIED',
      denialReason,
      authorizationReference: this.referenceFor(
        `scope|${command.subjectIdentityId.value}|${command.permissionId}|${denialReason}|${command.resourceReference?.value ?? ''}`,
      ),
    });
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
        decisionOutcome: 'DENIED',
        denialReason,
        ...(command.sessionIdentifier === undefined
          ? {}
          : { sessionIdentifier: command.sessionIdentifier }),
        ...(command.resourceReference === undefined
          ? {}
          : {
              resourceType: 'seller.profile',
              resourceReference: command.resourceReference.value,
            }),
        ...(correlationId === undefined ? {} : { correlationId }),
        decidedAt: now,
        createdAt: now,
      }),
    );
    return decision;
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
      authorizationReference: this.referenceFor(
        `${this.identifiers.next().value}|${permissionId}|${actorIdentityId.value}|${targetIdentityId.value}|${now.toISOString()}`,
      ),
      actorIdentityId,
      subjectIdentityId: targetIdentityId,
      targetIdentityId,
      permissionId,
      decisionOutcome: 'GRANTED',
      ...(correlationId === undefined ? {} : { correlationId }),
      decidedAt: now,
      createdAt: now,
    });
  }

  private createSellerRoleEvent(
    command: AssignSellerRoleCommand,
    assignmentId: UuidV7,
    now: Date,
  ): AuthorizationDecisionRecord {
    const correlationId = currentCorrelationId() ?? command.correlationId;
    return new AuthorizationDecisionRecord({
      authorizationReference: this.referenceFor(
        `${this.identifiers.next().value}|authorization.role.assign|${command.targetIdentityId.value}|${command.sellerProfileId.value}|${now.toISOString()}`,
      ),
      subjectIdentityId: command.targetIdentityId,
      targetIdentityId: command.targetIdentityId,
      permissionId: 'authorization.role.assign',
      decisionOutcome: 'GRANTED',
      resourceType: 'IdentityRoleAssignment',
      resourceReference: assignmentId.value,
      reasonCode: 'SELLER_LIFECYCLE_ACTIVATION',
      workloadIdentity: SELLER_LIFECYCLE_WORKLOAD_IDENTITY,
      ...(correlationId === undefined ? {} : { correlationId }),
      decidedAt: now,
      createdAt: now,
    });
  }

  private createSellerRoleRevocationEvent(
    command: RevokeSellerRoleCommand,
    now: Date,
  ): AuthorizationDecisionRecord {
    const correlationId = currentCorrelationId() ?? command.correlationId;
    return new AuthorizationDecisionRecord({
      authorizationReference: this.referenceFor(
        `${this.identifiers.next().value}|authorization.role.revoke|${command.identityId.value}|${now.toISOString()}`,
      ),
      ...(command.revokedByIdentityId === undefined
        ? {}
        : { actorIdentityId: command.revokedByIdentityId }),
      subjectIdentityId: command.identityId,
      targetIdentityId: command.identityId,
      permissionId: 'authorization.role.revoke',
      decisionOutcome: 'GRANTED',
      resourceType: 'IdentityRoleAssignment',
      reasonCode: command.reasonReference ?? 'SELLER_ROLE_REVOKED',
      ...(command.revokedByIdentityId === undefined
        ? { workloadIdentity: SELLER_LIFECYCLE_WORKLOAD_IDENTITY }
        : {}),
      ...(correlationId === undefined ? {} : { correlationId }),
      decidedAt: now,
      createdAt: now,
    });
  }

  private referenceFor(source: string): string {
    return `azr:${createHash('sha256')
      .update(source)
      .digest('hex')
      .slice(0, 24)}`;
  }
}

function isUuidV7String(value: string | undefined): value is string {
  if (value === undefined) {
    return false;
  }
  try {
    new UuidV7(value);
    return true;
  } catch {
    return false;
  }
}
