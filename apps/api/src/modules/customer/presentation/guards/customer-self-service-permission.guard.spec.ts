/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PERMISSION_METADATA_KEY } from '../../../authorization/presentation/guards/authorization-permission.guard';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import type { CustomerProfileRepository } from '../../domain/ports/customer-repository.port';
import {
  CustomerSelfServicePermissionGuard,
  type CustomerScopedRequest,
} from './customer-self-service-permission.guard';

const SUBJECT = new UuidV7('0191310f-789a-7123-8123-000000000001');
const CUSTOMER = new UuidV7('0191310f-789a-7123-8123-000000000002');

function requestWithClaims(claims: unknown): CustomerScopedRequest {
  return { authentication: claims } as unknown as CustomerScopedRequest;
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

function repositoryWith(profile: unknown): CustomerProfileRepository {
  return {
    findByIdentityId: jest.fn().mockResolvedValue(profile),
  } as unknown as CustomerProfileRepository;
}

function authorizationWith(authorize: jest.Mock): AuthorizationApplicationService {
  return { authorize } as unknown as AuthorizationApplicationService;
}

describe('CustomerSelfServicePermissionGuard (M06-M4, D-07 customer-identity scope)', () => {
  it('grants when the caller owns a customer profile and Module 02 grants the permission', async () => {
    const authorize = jest.fn().mockResolvedValue(grantedDecision());
    const guard = new CustomerSelfServicePermissionGuard(
      authorizationWith(authorize),
      repositoryWith({
        properties: { customerProfileId: CUSTOMER },
      }),
    );
    const request = requestWithClaims({ subject: SUBJECT.value, sessionId: 's' });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('customer.profile.read'), request)),
    ).resolves.toBe(true);
    expect(authorize).toHaveBeenCalledWith({
      subjectIdentityId: SUBJECT,
      permissionId: 'customer.profile.read',
      sessionIdentifier: 's',
      resourceReference: CUSTOMER,
    });
    expect(request.customerContext.customerProfileId.value).toBe(CUSTOMER.value);
  });

  it('resolves the profile from the authenticated identity, never from the client', async () => {
    const authorize = jest.fn().mockResolvedValue(grantedDecision());
    const customers = repositoryWith({
      properties: { customerProfileId: CUSTOMER },
    });
    const guard = new CustomerSelfServicePermissionGuard(authorizationWith(authorize), customers);
    const request = requestWithClaims({ subject: SUBJECT.value, sessionId: 's' });

    await guard.canActivate(contextFor(handlerWithPermission('customer.address.read'), request));

    expect(customers.findByIdentityId).toHaveBeenCalledWith(SUBJECT);
  });

  it('denies when the caller has no customer profile (missing association)', async () => {
    const authorize = jest.fn();
    const guard = new CustomerSelfServicePermissionGuard(
      authorizationWith(authorize),
      repositoryWith(null),
    );
    const request = requestWithClaims({ subject: SUBJECT.value, sessionId: 's' });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('customer.profile.read'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorize).not.toHaveBeenCalled();
  });

  it('denies when the permission is not declared on the handler', async () => {
    const authorize = jest.fn();
    const guard = new CustomerSelfServicePermissionGuard(
      authorizationWith(authorize),
      repositoryWith({ properties: { customerProfileId: CUSTOMER } }),
    );
    const request = requestWithClaims({ subject: SUBJECT.value, sessionId: 's' });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission(undefined), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies when the request is unauthenticated (Aal2SessionGuard did not run)', async () => {
    const authorize = jest.fn();
    const guard = new CustomerSelfServicePermissionGuard(
      authorizationWith(authorize),
      repositoryWith({ properties: { customerProfileId: CUSTOMER } }),
    );
    const request = requestWithClaims(undefined);

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('customer.profile.read'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies when the Module 02 engine denies (e.g. cross-customer scope)', async () => {
    const authorize = jest.fn().mockResolvedValue(deniedDecision());
    const guard = new CustomerSelfServicePermissionGuard(
      authorizationWith(authorize),
      repositoryWith({ properties: { customerProfileId: CUSTOMER } }),
    );
    const request = requestWithClaims({ subject: SUBJECT.value, sessionId: 's' });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('customer.profile.read'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the authorization engine raises', async () => {
    const authorize = jest.fn().mockRejectedValue(new Error('engine unavailable'));
    const guard = new CustomerSelfServicePermissionGuard(
      authorizationWith(authorize),
      repositoryWith({ properties: { customerProfileId: CUSTOMER } }),
    );
    const request = requestWithClaims({ subject: SUBJECT.value, sessionId: 's' });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('customer.profile.read'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the profile lookup throws', async () => {
    const customers = {
      findByIdentityId: jest.fn().mockRejectedValue(new Error('storage down')),
    } as unknown as CustomerProfileRepository;
    const guard = new CustomerSelfServicePermissionGuard(authorizationWith(jest.fn()), customers);
    const request = requestWithClaims({ subject: SUBJECT.value, sessionId: 's' });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('customer.profile.read'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the authenticated subject is not a well-formed UUID', async () => {
    const guard = new CustomerSelfServicePermissionGuard(
      authorizationWith(jest.fn()),
      repositoryWith({ properties: { customerProfileId: CUSTOMER } }),
    );
    const request = requestWithClaims({ subject: 'not-a-uuid', sessionId: 's' });

    await expect(
      guard.canActivate(contextFor(handlerWithPermission('customer.profile.read'), request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
