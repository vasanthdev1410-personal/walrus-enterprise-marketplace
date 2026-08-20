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
import type { PaymentAdminAction } from '../../application/ports/payment-admin-authorization.port';
import type { PaymentAdminAuthorizationPort } from '../../application/ports/payment-admin-authorization.port';
import { PAYMENT_ADMIN_AUTHORIZATION } from '../../payment.tokens';

/**
 * Sets the required admin action on a handler for the PaymentAdminPermissionGuard.
 */
export const RequirePaymentAdminAction = (action: PaymentAdminAction): CustomDecorator =>
  SetMetadata('payment:adminAction', action);

/**
 * WEMP-M09-AUTHZ-001 §2.2 (M09-M4). The payment admin permission guard:
 *
 *  1. requires the authenticated claims (Aal2SessionGuard runs first);
 *  2. evaluates the declared admin permission through the Module 02
 *     authorization engine (no customer-identity scope);
 *  3. stores the caller's identity on the request for the controller.
 *
 * Fails closed: no authentication, no permission, or a denied decision all
 * raise AUTHORIZATION_DENIED.
 */
@Injectable()
export class PaymentAdminPermissionGuard implements CanActivate {
  public constructor(
    @Inject(PAYMENT_ADMIN_AUTHORIZATION)
    private readonly adminAuth: PaymentAdminAuthorizationPort,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const claims = (request as Partial<AuthenticatedRequest>).authentication;
    if (claims === undefined) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    const action: unknown = Reflect.getMetadata('payment:adminAction', context.getHandler());
    if (typeof action !== 'string') {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    const identityId = new UuidV7(claims.subject);
    try {
      const granted = await this.adminAuth.isGranted(
        identityId,
        action as PaymentAdminAction,
      );
      if (!granted) {
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    return true;
  }
}
