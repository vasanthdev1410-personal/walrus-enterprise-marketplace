import {
  CanActivate,
  CustomDecorator,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthenticatedRequest } from '../../../identity-authentication/presentation/authentication-context';
import type { OrderAdminAction } from '../../application/ports/order-admin-authorization.port';
import type { OrderAdminAuthorizationPort } from '../../application/ports/order-admin-authorization.port';
import { ORDER_ADMIN_AUTHORIZATION } from '../../order.tokens';

/**
 * Sets the required admin action on a handler for the OrderAdminPermissionGuard.
 */
export const RequireAdminAction = (action: OrderAdminAction): CustomDecorator =>
  SetMetadata('order:adminAction', action);

/**
 * WEMP-M08-AUTHZ-001 §2.2 (D-08, Module 02 owner sign-off RECORDED 2026-08-20;
 * M08-M4). The order admin permission guard:
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
export class OrderAdminPermissionGuard implements CanActivate {
  public constructor(
    @Inject(ORDER_ADMIN_AUTHORIZATION)
    private readonly adminAuth: OrderAdminAuthorizationPort,
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
    const action: unknown = Reflect.getMetadata('order:adminAction', context.getHandler());
    if (typeof action !== 'string') {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    const identityId = new UuidV7(claims.subject);
    try {
      const granted = await this.adminAuth.isGranted(
        identityId,
        action as 'order.admin.read' | 'order.admin.manage',
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
