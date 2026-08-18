import { Inject, Injectable } from '@nestjs/common';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../../../authorization/authorization.tokens';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  CustomerAdminAction,
  CustomerAdminAuthorizationPort,
} from '../ports/customer-admin-authorization.port';

/**
 * WEMP-M06-AUTHZ-001 §2.2 (decision D-07, Module 02 owner sign-off RECORDED
 * 2026-08-17; M06-M4). Maps every Module 06 customer administrative action to
 * its approved Module 02 permission identifier and asks the Module 02
 * authorization engine. Deny by default: an action without an approved
 * identifier fails closed (denied), and an engine failure never surfaces as a
 * grant. The identifiers are granted to ADMIN and SUPER_ADMIN exactly as
 * approved — no override, no wildcard, no hidden role bypass (the engine
 * decides; Module 06 never evaluates roles itself, A-02). This adapter
 * replaces the M06-M3 deny-all placeholder at the port boundary (M06-M4).
 */
const ADMIN_ACTION_TO_PERMISSION: Readonly<Record<CustomerAdminAction, string>> = Object.freeze({
  'customer.read': 'customer.read',
  'customer.lifecycle.manage': 'customer.lifecycle.manage',
  'customer.audit.view': 'customer.audit.view',
});

@Injectable()
export class Module02CustomerAdminAuthorizationAdapter implements CustomerAdminAuthorizationPort {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  public async isGranted(identityId: UuidV7, action: CustomerAdminAction): Promise<boolean> {
    const permissionId = ADMIN_ACTION_TO_PERMISSION[action];
    try {
      const decision = await this.authorization.authorize({
        subjectIdentityId: identityId,
        permissionId,
      });
      return decision.granted;
    } catch {
      // Authorization dependency failure: fail closed (deny). A customer
      // administrative action is never granted when the engine cannot decide.
      return false;
    }
  }
}
