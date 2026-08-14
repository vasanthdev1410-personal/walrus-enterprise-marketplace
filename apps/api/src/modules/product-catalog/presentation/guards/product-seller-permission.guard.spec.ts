import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PERMISSION_METADATA_KEY } from '../../../authorization/presentation/guards/authorization-permission.guard';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import {
  ProductSellerPermissionGuard,
  type ProductSellerScopedRequest,
} from './product-seller-permission.guard';

const SUBJECT = new UuidV7('0191310f-789a-7123-8123-000000000001');
const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000002');

function requestWithSeller(body: unknown, query: unknown = {}): ProductSellerScopedRequest {
  return { body, query } as unknown as ProductSellerScopedRequest;
}

function requestWithClaims(
  claims: unknown,
  body: unknown,
  query: unknown = {},
): ProductSellerScopedRequest {
  return { authentication: claims, body, query } as unknown as ProductSellerScopedRequest;
}

function handlerWithPermission(permissionId: string | undefined): () => void {
  const handler = (): void => undefined;
  if (permissionId !== undefined) {
    Reflect.defineMetadata(PERMISSION_METADATA_KEY, permissionId, handler);
  }
  return handler;
}

function contextFor(handler: () => void, request: Request): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function authorizationWith(authorize: jest.Mock): AuthorizationApplicationService {
  return { authorize } as unknown as AuthorizationApplicationService;
}

const claims = {
  subject: SUBJECT.value,
  sessionId: '0191310f-789a-7123-8123-000000000003',
};

describe('ProductSellerPermissionGuard (M04-M5, WEMP-M04-SPEC-001 §16)', () => {
  it('grants when Module 02 grants the org-scoped permission for the request seller', async () => {
    const authorize = jest.fn().mockResolvedValue({ granted: true });
    const guard = new ProductSellerPermissionGuard(authorizationWith(authorize));
    const request = requestWithClaims(claims, { sellerProfileId: SELLER.value });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('product.create'), request)),
    ).resolves.toBe(true);
    expect(authorize).toHaveBeenCalledWith({
      subjectIdentityId: SUBJECT,
      permissionId: 'product.create',
      sessionIdentifier: claims.sessionId,
      resourceReference: SELLER,
    });
    expect(request.productSellerContext.sellerProfileId).toEqual(SELLER);
  });

  it('reads the seller reference from the query for read routes', async () => {
    const authorize = jest.fn().mockResolvedValue({ granted: true });
    const guard = new ProductSellerPermissionGuard(authorizationWith(authorize));
    const request = requestWithClaims(claims, {}, { sellerProfileId: SELLER.value });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('product.read'), request)),
    ).resolves.toBe(true);
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ resourceReference: SELLER }));
  });

  it('denies without a permission declaration (fail closed)', async () => {
    const guard = new ProductSellerPermissionGuard(authorizationWith(jest.fn()));
    const request = requestWithSeller({ sellerProfileId: SELLER.value });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission(undefined), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies without authenticated claims (fail closed)', async () => {
    const guard = new ProductSellerPermissionGuard(authorizationWith(jest.fn()));
    const request = requestWithSeller({ sellerProfileId: SELLER.value });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('product.create'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies when the seller reference is missing (no client claim, fail closed)', async () => {
    const guard = new ProductSellerPermissionGuard(authorizationWith(jest.fn()));
    const request = requestWithClaims(claims, {});

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('product.create'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a malformed seller reference (fail closed)', async () => {
    const guard = new ProductSellerPermissionGuard(authorizationWith(jest.fn()));
    const request = requestWithClaims(claims, { sellerProfileId: 'not-a-uuid' });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('product.create'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies when Module 02 denies the decision (fail closed)', async () => {
    const guard = new ProductSellerPermissionGuard(
      authorizationWith(jest.fn().mockResolvedValue({ granted: false })),
    );
    const request = requestWithClaims(claims, { sellerProfileId: SELLER.value });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('product.create'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies when the authorization dependency raises (fail closed, never a grant)', async () => {
    const guard = new ProductSellerPermissionGuard(
      authorizationWith(jest.fn().mockRejectedValue(new Error('engine unavailable'))),
    );
    const request = requestWithClaims(claims, { sellerProfileId: SELLER.value });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('product.create'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
