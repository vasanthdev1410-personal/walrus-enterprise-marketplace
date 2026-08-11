import { createHash } from 'node:crypto';
import type { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AuthorizationDecision } from './authorization-decision';
import type { IdentityRoleAssignment } from './entities/identity-role-assignment';
import type { PermissionCatalog } from './permission-catalog';
import type { RoleCatalog } from './role-catalog';
import type { AuthorizationDenialReason } from './value-objects/authorization-denial-reason';
import type { ResourceClassification } from './value-objects/resource-classification';

/**
 * Part 6.1 §5 / Part 6.3 §13–15 (Module 02 source material). The pure, single
 * authorization decision engine. It is deterministic (identical inputs produce
 * identical decisions) and denies by default: a request is granted only when
 * every condition below holds, otherwise it is denied with a non-sensitive
 * internal reason. No protected operation may execute before this evaluation
 * completes successfully.
 *
 * Evaluation order:
 *  1. Explicit deny overrides take precedence (Part 6.4 §17).
 *  2. The requested permission must exist and be ACTIVE in the registry
 *     (implicit permissions are prohibited — Part 6.2 §8).
 *  3. The subject must hold at least one ACTIVE role assignment (Part 6.2 §9).
 *  4. An ACTIVE assignment must reference an ACTIVE role in the catalog whose
 *     granted-permission set contains the requested permission. Role hierarchy
 *     is administrative scope only and never contributes permissions (Part
 *     6.2 §7).
 */
export interface AuthorizationRequest {
  readonly subjectIdentityId: UuidV7;
  readonly permissionId: string;
  /**
   * Resource classification (Part 6.3 §11). Accepted as an input contract for
   * policy evaluation; no classification-based policy matrix is approved for
   * Phase 1, so it does not influence the Phase-1 decision.
   */
  readonly resourceClassification?: ResourceClassification;
  /** Explicit deny overrides (Part 6.4 §17); take precedence over any grant. */
  readonly explicitDenyPermissionIds?: readonly string[];
}

export class AuthorizationDecisionEngine {
  public constructor(
    private readonly permissionCatalog: PermissionCatalog,
    private readonly roleCatalog: RoleCatalog,
  ) {}

  public evaluate(
    request: AuthorizationRequest,
    assignments: readonly IdentityRoleAssignment[],
  ): AuthorizationDecision {
    if (request.explicitDenyPermissionIds?.includes(request.permissionId)) {
      return this.decide(request, 'DENIED', 'EXPLICITLY_DENIED', assignments);
    }

    const permission = this.permissionCatalog.find(request.permissionId);
    if (permission === undefined) {
      return this.decide(request, 'DENIED', 'UNKNOWN_PERMISSION', assignments);
    }
    if (permission.properties.status === 'RETIRED') {
      return this.decide(request, 'DENIED', 'RETIRED_PERMISSION', assignments);
    }

    const activeAssignments = assignments.filter(
      (assignment) => assignment.properties.assignmentState === 'ACTIVE',
    );
    if (activeAssignments.length === 0) {
      return this.decide(request, 'DENIED', 'NO_ACTIVE_ASSIGNMENT', assignments);
    }

    let referencedUnknownRole = false;
    for (const assignment of activeAssignments) {
      const role = this.roleCatalog.findByName(assignment.properties.roleName);
      if (role === undefined) {
        referencedUnknownRole = true;
        continue;
      }
      if (role.properties.state !== 'ACTIVE') {
        continue;
      }
      if (role.properties.grantedPermissionIds.includes(request.permissionId)) {
        return this.decide(request, 'GRANTED', undefined, assignments);
      }
    }
    return this.decide(
      request,
      'DENIED',
      referencedUnknownRole ? 'UNKNOWN_ROLE' : 'PERMISSION_NOT_GRANTED',
      assignments,
    );
  }

  private decide(
    request: AuthorizationRequest,
    outcome: 'GRANTED' | 'DENIED',
    denialReason: AuthorizationDenialReason | undefined,
    assignments: readonly IdentityRoleAssignment[],
  ): AuthorizationDecision {
    const referenceSource = [
      request.subjectIdentityId.value,
      request.permissionId,
      outcome,
      denialReason ?? '',
      ...assignments.map((assignment) => assignment.properties.assignmentId.value),
    ].join('|');
    const authorizationReference = `azr:${createHash('sha256')
      .update(referenceSource)
      .digest('hex')
      .slice(0, 24)}`;
    return denialReason === undefined
      ? new AuthorizationDecision({ outcome, authorizationReference })
      : new AuthorizationDecision({ outcome, denialReason, authorizationReference });
  }
}
