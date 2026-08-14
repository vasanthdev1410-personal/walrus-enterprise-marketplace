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

/**
 * The seller scope for a seller product self-service request, resolved
 * server-side. The controller uses this context instead of any
 * client-supplied ownership claim: the sellerProfileId carried in the
 * request is validated by the Module 02 engine's organization-scoped path
 * (the second ownership resolver, WEMP-M04-AUTHZ-001 §4) before the route
 * runs, and is stored here for the controller. The application layer
 * re-validates ownership against the Module 02 resolver on every read and
 * mutation (fail closed, WEMP-M04-SPEC-001 §16).
 */
export interface ProductSellerRequestContext {
  readonly sellerProfileId: UuidV7;
}

export interface ProductSellerScopedRequest extends Request {
  productSellerContext: ProductSellerRequestContext;
}

/**
 * WEMP-M04-SPEC-001 §16/§18 + WEMP-M04-AUTHZ-001 §4 (M04-M5, decision D-11).
 * The seller product self-service permission guard:
 *
 *  1. requires the authenticated claims (Aal2SessionGuard runs first);
 *  2. reads the target sellerProfileId from the request (body for
 *     mutations, query for reads) and validates it is a well-formed UUIDv7;
 *  3. evaluates the declared Module 02 permission (product.* self-service
 *     set) through the Module 02 authorization engine with the target
 *     seller as the organization scope — the engine's organization-scoped
 *     path consults the second ownership resolver, which validates the
 *     caller's ACTIVE SellerIdentityAssociation against the authoritative
 *     association store. A caller without an ACTIVE association to the
 *     target seller is denied (SCOPE_NOT_ASSOCIATED), so a client can never
 *     claim ownership of a seller it does not belong to;
 *  4. stores the validated scope on the request for the controller.
 *
 * Fails closed: no permission declaration, no authentication, a missing or
 * malformed seller reference, an unresolvable scope, or a denied decision
 * all raise AUTHORIZATION_DENIED.
 */
@Injectable()
export class ProductSellerPermissionGuard implements CanActivate {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
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
    const sellerProfileId = parseSellerReference(request);
    if (sellerProfileId === null) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }

    let decision;
    try {
      decision = await this.authorization.authorize({
        subjectIdentityId: new UuidV7(claims.subject),
        permissionId,
        sessionIdentifier: claims.sessionId,
        // Organization scope: the engine validates the caller's ACTIVE
        // association to this seller through the second ownership resolver
        // (never from a client claim) and denies otherwise (fail closed).
        resourceReference: sellerProfileId,
      });
    } catch {
      // Authorization dependency failure: fail closed (deny).
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    if (!decision.granted) {
      throw new ForbiddenException('AUTHORIZATION_DENIED');
    }
    (request as ProductSellerScopedRequest).productSellerContext = { sellerProfileId };
    return true;
  }
}

/**
 * Extracts the target sellerProfileId from the request (body for mutations,
 * query for reads) and validates it is a well-formed UUIDv7. Returns null
 * when absent or malformed (deny). The identifier is only a reference to be
 * validated by the Module 02 engine — never a trusted ownership claim.
 */
function parseSellerReference(request: Request): UuidV7 | null {
  const body = request.body as { sellerProfileId?: unknown } | undefined;
  const query = request.query as { sellerProfileId?: unknown } | undefined;
  const raw: unknown = body?.sellerProfileId ?? query?.sellerProfileId;
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    return new UuidV7(raw);
  } catch {
    return null;
  }
}
