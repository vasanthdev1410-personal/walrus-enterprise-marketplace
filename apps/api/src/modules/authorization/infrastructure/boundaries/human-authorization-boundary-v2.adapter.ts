import { Inject, Injectable } from '@nestjs/common';
import type {
  ApprovalAuthorizationPort,
  ApproverAuthorizationCommand,
} from '../../../identity-authentication/application/ports/approval-authorization.port';
import type {
  IdentityStateChangeAuthorizationCommand,
  IdentityStateChangeAuthorizationPort,
} from '../../../identity-authentication/application/ports/identity-state-change-authorization.port';
import type { AuthorizationApplicationService } from '../../application/services/authorization-application.service';
import {
  AUTHORIZATION_APPLICATION_SERVICE,
  IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
} from '../../authorization.tokens';
import type { IdentityRoleAssignmentRepository } from '../../domain/repositories/identity-role-assignment-repository';

@Injectable()
export class HumanAuthorizationBoundaryV2Adapter
  implements ApprovalAuthorizationPort, IdentityStateChangeAuthorizationPort
{
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
    @Inject(IDENTITY_ROLE_ASSIGNMENT_REPOSITORY)
    private readonly assignments: IdentityRoleAssignmentRepository,
  ) {}

  public async authorizeApprover(command: ApproverAuthorizationCommand): Promise<{
    readonly authorized: boolean;
    readonly authorizationReference?: string;
  }> {
    if (
      command.assurance !== 'AAL2' ||
      !command.sessionId ||
      command.approverIdentityId.value === command.recoveredIdentityId.value ||
      command.requesterIdentityId?.value === command.approverIdentityId.value
    ) {
      return { authorized: false };
    }
    const decision = await this.authorization.authorize({
      subjectIdentityId: command.approverIdentityId,
      permissionId: 'recovery.approval.decide',
      sessionIdentifier: command.sessionId,
    });
    if (decision.properties.outcome !== 'GRANTED') return { authorized: false };
    const roles = await this.assignments.findActiveByIdentityId(command.approverIdentityId);
    const eligible =
      command.recoveredClassification === 'STANDARD_AUTHENTICATION'
        ? roles.some((assignment) =>
            ['ADMIN', 'SUPER_ADMIN'].includes(assignment.properties.roleName),
          )
        : roles.some((assignment) => assignment.properties.roleName === 'SUPER_ADMIN');
    return eligible
      ? { authorized: true, authorizationReference: decision.properties.authorizationReference }
      : { authorized: false };
  }

  public async authorizeStateChange(command: IdentityStateChangeAuthorizationCommand): Promise<{
    readonly authorized: boolean;
    readonly authorizationReference?: string;
  }> {
    if (
      command.assurance !== 'AAL2' ||
      !command.sessionId ||
      command.actorIdentityId.value === command.targetIdentityId.value ||
      command.targetIdentityState === 'DELETED'
    ) {
      return { authorized: false };
    }
    const decision = await this.authorization.authorize({
      subjectIdentityId: command.actorIdentityId,
      permissionId: 'identity.state.change',
      sessionIdentifier: command.sessionId,
    });
    if (decision.properties.outcome !== 'GRANTED') return { authorized: false };
    const [actorAssignments, targetAssignments] = await Promise.all([
      this.assignments.findActiveByIdentityId(command.actorIdentityId),
      this.assignments.findActiveByIdentityId(command.targetIdentityId),
    ]);
    const actorIsSuperAdmin = actorAssignments.some((a) => a.properties.roleName === 'SUPER_ADMIN');
    const actorIsAdmin = actorAssignments.some((a) => a.properties.roleName === 'ADMIN');
    const targetIsSuperAdmin =
      command.targetClassification === 'SUPER_ADMIN_AUTHENTICATION' ||
      targetAssignments.some((a) => a.properties.roleName === 'SUPER_ADMIN');
    const targetIsAdmin =
      command.targetClassification === 'PRIVILEGED_ADMIN_AUTHENTICATION' ||
      targetAssignments.some((a) => a.properties.roleName === 'ADMIN');
    const authorized = targetIsSuperAdmin
      ? false
      : actorIsSuperAdmin
        ? true
        : actorIsAdmin &&
          !targetIsAdmin &&
          ['ACTIVE', 'LOCKED', 'SUSPENDED'].includes(command.targetIdentityState);
    return authorized
      ? { authorized: true, authorizationReference: decision.properties.authorizationReference }
      : { authorized: false };
  }
}
