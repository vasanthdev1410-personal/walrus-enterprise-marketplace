import { Inject, Injectable } from '@nestjs/common';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { AUTHORIZATION_APPLICATION_SERVICE } from '../../../authorization/authorization.tokens';
import type {
  ProductAdminAction,
  ProductAdminAuthorizationPort,
} from '../ports/product-admin-authorization.port';

/**
 * WEMP-M04-AUTHZ-001 §2.2 / decision D-11. Maps every Module 04 product
 * administrative action to its approved Module 02 permission identifier and
 * asks the Module 02 authorization engine. Deny by default: an action without
 * an approved permission identifier fails closed (denied).
 *
 * Mapping notes:
 * - `product.review.decide` maps to the approved moderation permission
 *   (approve / reject / request corrections, WEMP-M04-SPEC-001 §15).
 * - `product.audit.view` maps to the approved list/detail/audit permission.
 * - `product.media.read` maps to the shared admin/seller media-read
 *   identifier (WEMP-M04-AUTHZ-001 §2.2; NOT organization-scoped — see
 *   permission-catalog.ts, so an admin inspection never requires a seller
 *   association).
 * No new permission is invented; every identifier is an approved catalog
 * entry (D-11, Module 02 owner sign-off 2026-08-14).
 */
const ADMIN_ACTION_TO_PERMISSION: Readonly<Record<ProductAdminAction, string>> = Object.freeze({
  'product.review.decide': 'product.review.decide',
  'product.audit.view': 'product.audit.view',
  'product.media.read': 'product.media.read',
});

@Injectable()
export class Module02ProductAdminAuthorizationAdapter implements ProductAdminAuthorizationPort {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
  ) {}

  public async isGranted(identityId: UuidV7, action: ProductAdminAction): Promise<boolean> {
    const permissionId = ADMIN_ACTION_TO_PERMISSION[action];
    try {
      const decision = await this.authorization.authorize({
        subjectIdentityId: identityId,
        permissionId,
      });
      return decision.granted;
    } catch {
      // Authorization dependency failure: fail closed (deny). A product
      // administrative action is never granted when the engine cannot decide.
      return false;
    }
  }
}
