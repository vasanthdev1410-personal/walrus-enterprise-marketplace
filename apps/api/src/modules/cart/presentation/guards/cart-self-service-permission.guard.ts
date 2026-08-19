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
 * The cart scope resolved server-side for a self-service request. The
 * controller uses this context instead of any client-supplied customer
 * identifier — the client never selects its ownership scope (the caller's
 * own profile is resolved from the authenticated Identity).
 */
export interface CartRequestContext {
  readonly customerProfileId: UuidV7;
}

export interface CartScopedRequest extends Request {
  cartContext: CartRequestContext;
}

/**
 * WEMP-M07-AUTHZ-001 §4 (D-09, Module 02 owner sign-off RECORDED 2026-08-19;
 * M07-M4). The cart self-service permission guard:
 *
 *  1. requires the authenticated claims (Aal2SessionGuard runs first);
 *  2. resolves the caller's OWN customer profile through the authoritative
 *     CustomerProfile store (identityId lookup) — never from a
 *     client-supplied customerProfileId/email/username/role identifier;
 *  3. evaluates the declared Module 02 permission through the Module 02
 *     authorization engine with the resolved customer profile as the
 *     customer-identity scope — the engine's customer-identity-scoped path
 *     consults the fourth ownership resolver, which validates the profile's
 *     identityId against the caller's authenticated Identity. A caller who
 *     does not own the profile (or a CLOSED profile) is denied;
 *  4. stores the resolved scope on the request for the controller.
 *
 * Fails closed: no permission declaration, no authentication, no resolvable
 * own profile, or a denied decision all raise AUTHORIZATION_DENIED. No
 * client-supplied identity is ever trusted (scope is always resolved
 * server-side).
 */
@Injectable()
export class CartSelfServicePermissionGuard implements CanActivate {
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
      // Server-side scope resolution: the caller's own customer profile,
      // derived from the authenticated identity through the authoritative
      // profile store. Any resolution error — including a malformed subject
      // claim — fails closed (deny).
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
      // Ownership resolver failure: never grant on uncertainty.
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    let decision;
    try {
      decision = await this.authorization.authorize({
        subjectIdentityId,
        permissionId,
        sessionIdentifier: claims.sessionId,
        // Customer-identity scope: the engine validates the caller's
        // Identity ownership of this profile through the fourth ownership
        // resolver (never from a client claim) and denies otherwise.
        resourceReference: customerProfileId,
      });
    } catch {
      // Authorization dependency failure: fail closed (deny).
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    if (!decision.granted) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    (request as CartScopedRequest).cartContext = { customerProfileId };
    return true;
  }
}
