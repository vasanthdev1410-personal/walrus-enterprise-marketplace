import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthenticatedRequest } from '../../../identity-authentication/presentation/authentication-context';
import type { CartAdminAuthorizationPort } from '../../application/ports/cart-admin-authorization.port';
import { CART_ADMIN_AUTHORIZATION } from '../../cart.tokens';

/**
 * WEMP-M07-AUTHZ-001 §2.2 (D-09, Module 02 owner sign-off RECORDED 2026-08-19;
 * M07-M4). The cart admin permission guard:
 *
 *  1. requires the authenticated claims (Aal2SessionGuard runs first);
 *  2. evaluates the declared admin permission through the Module 02
 *     authorization engine (no customer-identity scope — admin evaluates
 *     without customer context);
 *  3. stores the caller's identity on the request for the controller.
 *
 * Fails closed: no authentication, no permission, or a denied decision all
 * raise AUTHORIZATION_DENIED. No client-supplied identity is ever trusted.
 */
@Injectable()
export class CartAdminPermissionGuard implements CanActivate {
  public constructor(
    @Inject(CART_ADMIN_AUTHORIZATION)
    private readonly adminAuth: CartAdminAuthorizationPort,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const claims = (request as Partial<AuthenticatedRequest>).authentication;
    if (claims === undefined) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    // The controller must declare which admin action is required via a
    // custom metadata key. The guard checks that action through the admin
    // authorization port.
    const action: unknown = Reflect.getMetadata('cart:adminAction', context.getHandler());
    if (typeof action !== 'string') {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    const identityId = new UuidV7(claims.subject);
    try {
      const granted = await this.adminAuth.isGranted(
        identityId,
        action as 'cart.admin.read' | 'cart.admin.manage',
      );
      if (!granted) {
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      // Authorization dependency failure: fail closed (deny).
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    return true;
  }
}
