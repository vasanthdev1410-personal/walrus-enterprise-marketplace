import { Inject, Injectable } from '@nestjs/common';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../../../authorization/authorization.tokens';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  InventoryAdminAction,
  InventoryAdminAuthorizationPort,
} from '../ports/inventory-admin-authorization.port';

/**
 * WEMP-M05-AUTHZ-001 §2.2 (decision D-05, Module 02 owner sign-off
 * RECORDED 2026-08-15; M05-M4). Maps every Module 05 inventory
 * administrative action to its approved Module 02 permission identifier
 * and asks the Module 02 authorization engine. Deny by default: an action
 * without an approved identifier fails closed (denied), and an engine
 * failure never surfaces as a grant. The identifiers are granted to ADMIN
 * and SUPER_ADMIN exactly as approved — no override, no wildcard, no
 * hidden role bypass (the engine decides; Module 05 never evaluates roles
 * itself, A-02).
 */
const ADMIN_ACTION_TO_PERMISSION: Readonly<Record<InventoryAdminAction, string>> = Object.freeze({
  'inventory.adjust.admin': 'inventory.adjust.admin',
  'inventory.audit.view': 'inventory.audit.view',
});

@Injectable()
export class Module02InventoryAdminAuthorizationAdapter implements InventoryAdminAuthorizationPort {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  public async isGranted(identityId: UuidV7, action: InventoryAdminAction): Promise<boolean> {
    const permissionId = ADMIN_ACTION_TO_PERMISSION[action];
    try {
      const decision = await this.authorization.authorize({
        subjectIdentityId: identityId,
        permissionId,
      });
      return decision.granted;
    } catch {
      // Authorization dependency failure: fail closed (deny). An inventory
      // administrative action is never granted when the engine cannot decide.
      return false;
    }
  }
}
