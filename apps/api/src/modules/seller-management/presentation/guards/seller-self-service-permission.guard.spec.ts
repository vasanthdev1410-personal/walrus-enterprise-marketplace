/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PERMISSION_METADATA_KEY } from '../../../authorization/presentation/guards/authorization-permission.guard';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import type { SellerProfileRepository } from '../../domain/ports/seller-repository.port';
import {
  SellerSelfServicePermissionGuard,
  type SellerScopedRequest,
} from './seller-self-service-permission.guard';

const SUBJECT = new UuidV7('0191310f-789a-7123-8123-000000000001');
const SELLER = new UuidV7('0191310f-789a-7123-8123-000000000002');

function requestWithClaims(claims: unknown): SellerScopedRequest {
  return { authentication: claims } as unknown as SellerScopedRequest;
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

function grantedDecision(): { granted: true } {
  return { granted: true };
}

function deniedDecision(): { granted: false } {
  return { granted: false };
}

function repositoryWith(profile: unknown): SellerProfileRepository {
  return {
    findProfileByAssociatedIdentityId: jest.fn().mockResolvedValue(profile),
  } as unknown as SellerProfileRepository;
}

function authorizationWith(authorize: jest.Mock): AuthorizationApplicationService {
  return { authorize } as unknown as AuthorizationApplicationService;
}

describe('SellerSelfServicePermissionGuard (M03-M5, D-11 org scope)', () => {
  it('grants when the caller owns a seller and Module 02 grants the permission', async () => {
    const authorize = jest.fn().mockResolvedValue(grantedDecision());
    const guard = new SellerSelfServicePermissionGuard(
      authorizationWith(authorize),
      repositoryWith({
        properties: { sellerProfileId: SELLER },
      }),
    );
    const request = requestWithClaims({ subject: SUBJECT.value, sessionId: 's' });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('seller.warehouse.read'), request)),
    ).resolves.toBe(true);
    expect(authorize).toHaveBeenCalledWith({
      subjectIdentityId: SUBJECT,
      permissionId: 'seller.warehouse.read',
      sessionIdentifier: 's',
      resourceReference: SELLER,
    });
    expect(request.sellerContext.sellerProfileId.value).toBe(SELLER.value);
  });

  it('resolves the seller from the authenticated identity, never from the client', async () => {
    const authorize = jest.fn().mockResolvedValue(grantedDecision());
    const sellers = repositoryWith({
      properties: { sellerProfileId: SELLER },
    });
    const guard = new SellerSelfServicePermissionGuard(authorizationWith(authorize), sellers);
    const request = requestWithClaims({ subject: SUBJECT.value, sessionId: 's' });

    await guard.canActivate(contextFor(handlerWithPermission('seller.agreement.read'), request));

    expect(sellers.findProfileByAssociatedIdentityId).toHaveBeenCalledWith(SUBJECT);
    // No client-supplied identifier ever reaches the engine as a scope.
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ resourceReference: SELLER }));
  });

  it('fails closed with AUTHORIZATION_DENIED when the decision is denied', async () => {
    const guard = new SellerSelfServicePermissionGuard(
      authorizationWith(jest.fn().mockResolvedValue(deniedDecision())),
      repositoryWith({ properties: { sellerProfileId: SELLER } }),
    );

    await expect(
      guard.canActivate(
        contextFor(
          handlerWithPermission('seller.warehouse.manage'),
          requestWithClaims({ subject: SUBJECT.value, sessionId: 's' }),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the route declares no permission', async () => {
    const guard = new SellerSelfServicePermissionGuard(
      authorizationWith(jest.fn()),
      repositoryWith({ properties: { sellerProfileId: SELLER } }),
    );

    await expect(
      guard.canActivate(
        contextFor(
          handlerWithPermission(undefined),
          requestWithClaims({ subject: SUBJECT.value, sessionId: 's' }),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the request carries no authenticated claims', async () => {
    const guard = new SellerSelfServicePermissionGuard(
      authorizationWith(jest.fn()),
      repositoryWith({ properties: { sellerProfileId: SELLER } }),
    );

    await expect(
      guard.canActivate(
        contextFor(handlerWithPermission('seller.member.read'), requestWithClaims(undefined)),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the caller has no resolvable seller (no association)', async () => {
    const authorize = jest.fn();
    const guard = new SellerSelfServicePermissionGuard(
      authorizationWith(authorize),
      repositoryWith(null),
    );

    await expect(
      guard.canActivate(
        contextFor(
          handlerWithPermission('seller.member.read'),
          requestWithClaims({ subject: SUBJECT.value, sessionId: 's' }),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorize).not.toHaveBeenCalled();
  });

  it('fails closed when the authorization engine errors (dependency failure)', async () => {
    const guard = new SellerSelfServicePermissionGuard(
      authorizationWith(jest.fn().mockRejectedValue(new Error('engine down'))),
      repositoryWith({ properties: { sellerProfileId: SELLER } }),
    );

    await expect(
      guard.canActivate(
        contextFor(
          handlerWithPermission('seller.warehouse.read'),
          requestWithClaims({ subject: SUBJECT.value, sessionId: 's' }),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the ownership resolution errors', async () => {
    const sellers = repositoryWith(undefined);
    sellers.findProfileByAssociatedIdentityId = jest
      .fn()
      .mockRejectedValue(new Error('storage down'));
    const guard = new SellerSelfServicePermissionGuard(authorizationWith(jest.fn()), sellers);

    await expect(
      guard.canActivate(
        contextFor(
          handlerWithPermission('seller.warehouse.read'),
          requestWithClaims({ subject: SUBJECT.value, sessionId: 's' }),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
