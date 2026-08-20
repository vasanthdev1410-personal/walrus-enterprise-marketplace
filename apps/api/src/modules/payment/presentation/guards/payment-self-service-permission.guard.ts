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
import { AUTHORIZATION_APPLICATION_SERVICE } from '../../../authorization/authorization.tokens';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { PERMISSION_METADATA_KEY } from '../../../authorization/presentation/guards/authorization-permission.guard';
import type { CustomerProfileRepository } from '../../../customer/domain/ports/customer-repository.port';
import { CUSTOMER_PROFILE_REPOSITORY } from '../../../customer/customer.tokens';

/**
 * The payment scope resolved server-side for a self-service request.
 * The controller uses this context instead of any client-supplied customer
 * identifier — the client never selects its ownership scope.
 */
export interface PaymentRequestContext {
  readonly customerProfileId: UuidV7;
}

export interface PaymentScopedRequest extends Request {
  paymentContext: PaymentRequestContext;
}

/**
 * WEMP-M09-AUTHZ-001 §4 (M09-M4). The payment self-service permission guard:
 *
 *  1. requires the authenticated claims (Aal2SessionGuard runs first);
 *  2. resolves the caller's OWN customer profile through the authoritative
 *     CustomerProfile store (identityId lookup) — never from a
 *     client-supplied customerProfileId;
 *  3. evaluates the declared Module 02 permission through the Module 02
 *     authorization engine with the resolved customer profile as the
 *     customer-identity scope;
 *  4. stores the resolved scope on the request for the controller.
 *
 * Fails closed: no permission declaration, no authentication, no resolvable
 * own profile, or a denied decision all raise AUTHORIZATION_DENIED.
 */
@Injectable()
export class PaymentSelfServicePermissionGuard implements CanActivate {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
    @Inject(CUSTOMER_PROFILE_REPOSITORY)
    private readonly customers: CustomerProfileRepository,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionId: unknown = Reflect.getMetadata(
      PERMISSION_METADATA_KEY,
      context.getHandler(),
    );
    if (typeof permissionId !== 'string') {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const claims = (request as Partial<AuthenticatedRequest>).authentication;
    if (claims === undefined) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    let subjectIdentityId: UuidV7;
    let customerProfileId: UuidV7;
    try {
      subjectIdentityId = new UuidV7(claims.subject);
      const profile = await this.customers.findByIdentityId(subjectIdentityId);
      if (profile === null) {
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      }
      customerProfileId = profile.properties.customerProfileId;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    let decision;
    try {
      decision = await this.authorization.authorize({
        subjectIdentityId,
        permissionId,
        sessionIdentifier: claims.sessionId,
        resourceReference: customerProfileId,
      });
    } catch {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    if (!decision.granted) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    (request as PaymentScopedRequest).paymentContext = { customerProfileId };
    return true;
  }
}
