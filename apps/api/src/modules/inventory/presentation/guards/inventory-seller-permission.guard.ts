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
import type { Module04ProductCatalogReadPort } from '../../domain/ports/module-04-product-catalog.port';
import { MODULE04_PRODUCT_CATALOG_READ } from '../../inventory.tokens';

/**
 * The validated seller scope for an inventory seller self-service request,
 * resolved server-side. The controller uses this context instead of any
 * client-supplied ownership claim: the sellerProfileId carried in the
 * request is validated by the Module 02 engine's organization-scoped path
 * (the approved third ownership-resolver scope, WEMP-M05-AUTHZ-001 §4)
 * before the route runs, and for SKU-scoped routes is additionally
 * cross-checked against the Module 04 SKU fact so a caller can never claim
 * ownership of a SKU it does not own. The application layer re-validates
 * ownership on every read and mutation (fail closed, WEMP-M05-SPEC-001 §19).
 */
export interface InventorySellerRequestContext {
  readonly sellerProfileId: UuidV7;
}

export interface InventorySellerScopedRequest extends Request {
  inventorySellerContext: InventorySellerRequestContext;
}

/**
 * WEMP-M05-SPEC-001 §15/§19 + WEMP-M05-AUTHZ-001 §4 (M05-M5, decision D-05).
 * The seller inventory self-service permission guard:
 *
 *  1. requires the authenticated claims (Aal2SessionGuard runs first);
 *  2. reads the target sellerProfileId from the request (body for
 *     mutations, query for reads) and validates it is a well-formed UUIDv7;
 *  3. for SKU-scoped routes, resolves the target SKU's owning seller
 *     organization through the Module 04 `ProductCatalogReadPort` facts
 *     (D-10/D-15 — unknown, non-PUBLISHED, and other-organization SKUs are
 *     indistinguishable and denied); a SKU whose facts resolve to a
 *     different seller organization is denied before the route runs;
 *  4. evaluates the declared Module 02 permission (inventory.read /
 *     inventory.adjust.self) through the Module 02 authorization engine
 *     with the target seller as the organization scope — the engine's
 *     organization-scoped path consults the third ownership resolver, which
 *     validates the caller's ACTIVE SellerIdentityAssociation against the
 *     authoritative association store. A caller without an ACTIVE
 *     association to the target seller is denied (SCOPE_NOT_ASSOCIATED);
 *  5. stores the validated scope on the request for the controller.
 *
 * Fails closed: no permission declaration, no authentication, a missing or
 * malformed seller reference, an unresolvable SKU fact, a SKU owned by
 * another organization, or a denied decision all raise AUTHORIZATION_DENIED.
 */
@Injectable()
export class InventorySellerPermissionGuard implements CanActivate {
  public constructor(
    @Inject(AUTHORIZATION_APPLICATION_SERVICE)
    private readonly authorization: AuthorizationApplicationService,
    @Inject(MODULE04_PRODUCT_CATALOG_READ)
    private readonly module04: Module04ProductCatalogReadPort,
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

    // SKU-scoped routes: the target SKU must resolve to the claimed seller
    // organization through the Module 04 facts (D-10/D-15). Unknown /
    // non-PUBLISHED SKUs and SKUs owned by another organization are
    // indistinguishable and denied (fail closed, anti-enumeration).
    const skuId = parseSkuParam(request);
    if (skuId !== null) {
      const fact = await this.module04.getConsumableSkuFact(skuId);
      if (fact === null) {
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      }
      if (fact.sellerProfileId.value !== sellerProfileId.value) {
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      }
    }

    let decision;
    try {
      decision = await this.authorization.authorize({
        subjectIdentityId: new UuidV7(claims.subject),
        permissionId,
        sessionIdentifier: claims.sessionId,
        // Organization scope: the engine validates the caller's ACTIVE
        // association to this seller through the third ownership resolver
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
    (request as InventorySellerScopedRequest).inventorySellerContext = { sellerProfileId };
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

/**
 * Extracts the `:skuId` path parameter (when present) and validates it is a
 * well-formed UUIDv7. Returns null when absent or malformed (the caller then
 * only performs the organization-scoped check — a malformed SKU reference is
 * rejected by the DTO/parameter validation downstream, and the guard denies
 * SKU-scoped ownership entirely when it cannot be parsed).
 */
function parseSkuParam(request: Request): UuidV7 | null {
  const params = request.params as { skuId?: unknown } | undefined;
  const raw: unknown = params?.skuId;
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    return new UuidV7(raw);
  } catch {
    return null;
  }
}
