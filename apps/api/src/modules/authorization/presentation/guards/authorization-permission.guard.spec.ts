import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../application/services/authorization-application.service';
import {
  AuthorizationPermissionGuard,
  PERMISSION_METADATA_KEY,
} from './authorization-permission.guard';

const SUBJECT = new UuidV7('0191310f-789a-7123-8123-000000000001');

function grantedDecision(): { granted: true } {
  return { granted: true };
}

function deniedDecision(): { granted: false } {
  return { granted: false };
}

function requestWithClaims(claims: unknown): Request {
  return { authentication: claims } as unknown as Request;
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

describe('AuthorizationPermissionGuard (Part 6.3 §14)', () => {
  it('grants access when the authorization decision is granted', async () => {
    const authorize = jest.fn().mockResolvedValue(grantedDecision());
    const guard = new AuthorizationPermissionGuard({
      authorize,
    } as unknown as AuthorizationApplicationService);

    await expect(
      guard.canActivate(
        contextFor(
          handlerWithPermission('recovery.approval.decide'),
          requestWithClaims({ subject: SUBJECT.value, sessionId: 's' }),
        ),
      ),
    ).resolves.toBe(true);
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ permissionId: 'recovery.approval.decide' }),
    );
  });

  it('fails closed with AUTHORIZATION_DENIED when the decision is denied', async () => {
    const guard = new AuthorizationPermissionGuard({
      authorize: jest.fn().mockResolvedValue(deniedDecision()),
    } as unknown as AuthorizationApplicationService);

    await expect(
      guard.canActivate(
        contextFor(
          handlerWithPermission('identity.privileged.provision'),
          requestWithClaims({ subject: SUBJECT.value, sessionId: 's' }),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the route declares no permission', async () => {
    const authorize = jest.fn();
    const guard = new AuthorizationPermissionGuard({
      authorize,
    } as unknown as AuthorizationApplicationService);

    await expect(
      guard.canActivate(
        contextFor(
          handlerWithPermission(undefined),
          requestWithClaims({ subject: SUBJECT.value, sessionId: 's' }),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorize).not.toHaveBeenCalled();
  });

  it('fails closed when the request carries no authenticated claims', async () => {
    const guard = new AuthorizationPermissionGuard({
      authorize: jest.fn(),
    } as unknown as AuthorizationApplicationService);

    await expect(
      guard.canActivate(
        contextFor(handlerWithPermission('recovery.approval.decide'), requestWithClaims(undefined)),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
