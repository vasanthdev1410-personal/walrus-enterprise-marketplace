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
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import { SELLER_PROFILE_REPOSITORY } from '../../seller-management.tokens';

/**
 * The seller scope resolved server-side for a self-service request. The
 * controller uses this context instead of any client-supplied seller/org
 * identifier — the client never selects its ownership scope.
 */
export interface SellerRequestContext {
  readonly sellerProfileId: UuidV7;
}

export interface SellerScopedRequest extends Request {
  sellerContext: SellerRequestContext;
}

/**
 * WEMP-M03-SPEC-001 §12.2/§13 (M03-M5) + WEMP-M03-AUTHZ-001 §4 (D-11).
 * The seller self-service permission guard:
 *
 *  1. requires the authenticated claims (Aal2SessionGuard runs first);
 *  2. resolves the caller's OWN seller profile through the authoritative
 *     SellerIdentityAssociation store — never from a client-supplied
 *     sellerProfileId/organizationId/owner identifier;
 *  3. evaluates the declared Module 02 permission through the Module 02
 *     authorization engine with the resolved seller as the organization
 *     scope (the single source of authorization truth);
 *  4. stores the resolved scope on the request for the controller.
 *
 * Fails closed: no permission declaration, no authentication, no resolvable
 * seller, or a denied decision all raise AUTHORIZATION_DENIED.
 */
@Injectable()
export class SellerSelfServicePermissionGuard implements CanActivate {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
    @Inject(SELLER_PROFILE_REPOSITORY)
    private readonly sellers: SellerProfileRepository,
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
    const subjectIdentityId = new UuidV7(claims.subject);
    let sellerProfileId;
    try {
      // Server-side scope resolution: the caller's own seller, derived from
      // the authenticated identity through the authoritative association
      // store. Any resolution error fails closed (deny).
      const profile = await this.sellers.findProfileByAssociatedIdentityId(subjectIdentityId);
      if (profile === null) {
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      }
      sellerProfileId = profile.properties.sellerProfileId;
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
        resourceReference: sellerProfileId,
      });
    } catch {
      // Authorization dependency failure: fail closed (deny).
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    if (!decision.granted) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    (request as SellerScopedRequest).sellerContext = { sellerProfileId };
    return true;
  }
}
