import { Inject, Injectable } from '@nestjs/common';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../../../authorization/authorization.tokens';
import type {
  SellerAdminAction,
  SellerAdminAuthorizationPort,
} from '../ports/seller-admin-authorization.port';

/**
 * WEMP-M03-AUTHZ-001 §2.2 / decision D-11. Maps every Module 03 seller
 * administrative action to its approved Module 02 permission identifier and
 * asks the Module 02 authorization engine. Deny by default: an action without
 * an approved permission identifier fails closed (denied).
 *
 * Mapping notes:
 * - `seller.review.claim` (claiming a review / requesting corrections) is part
 *   of the approved review surface — WEMP-M03-SPEC-001 §13 gates the whole
 *   review action set with `seller.review.decide`, so the claim action maps to
 *   the same approved permission. No new permission is invented.
 * - `seller.audit.view` maps to its approved permission for the admin
 *   list/detail surface (WEMP-M03-AUTHZ-001 §2.2).
 * - `seller.legalhold.manage` has NO approved permission identifier in
 *   WEMP-M03-AUTHZ-001 §2.2. Mapping it onto another permission would be an
 *   implicit grant (prohibited), so it fails closed until the Module 02 owner
 *   records an explicit permission for legal-hold management. This preserves
 *   the M03-M3 fail-closed behavior for that action.
 */
const ADMIN_ACTION_TO_PERMISSION: Readonly<Record<SellerAdminAction, string | null>> =
  Object.freeze({
    'seller.review.claim': 'seller.review.decide',
    'seller.review.decide': 'seller.review.decide',
    'seller.suspend.manage': 'seller.suspend.manage',
    'seller.evidence.read': 'seller.evidence.read',
    'seller.audit.view': 'seller.audit.view',
    'seller.legalhold.manage': null,
  });

@Injectable()
export class Module02SellerAdminAuthorizationAdapter implements SellerAdminAuthorizationPort {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  public async isGranted(identityId: UuidV7, action: SellerAdminAction): Promise<boolean> {
    const permissionId = ADMIN_ACTION_TO_PERMISSION[action];
    if (permissionId === null) {
      // No approved permission: fail closed (deny). Never an implicit grant.
      return false;
    }
    try {
      const decision = await this.authorization.authorize({
        subjectIdentityId: identityId,
        permissionId,
      });
      return decision.granted;
    } catch {
      // Authorization dependency failure: fail closed (deny). A seller
      // administrative action is never granted when the engine cannot decide.
      return false;
    }
  }
}
