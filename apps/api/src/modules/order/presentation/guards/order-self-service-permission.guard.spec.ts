/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import type { CustomerProfileRepository } from '../../../customer/domain/ports/customer-repository.port';
import { OrderSelfServicePermissionGuard } from './order-self-service-permission.guard';

const IDENTITY_ID = new UuidV7('0191310f-789a-7000-8000-000000000010');
const CUSTOMER_PROFILE_ID = new UuidV7('0191310f-789a-7000-8000-000000000020');

function createMockProfile(): { properties: { customerProfileId: UuidV7; identityId: UuidV7; state: 'ACTIVE' } } {
  return {
    properties: {
      customerProfileId: CUSTOMER_PROFILE_ID,
      identityId: IDENTITY_ID,
      state: 'ACTIVE' as const,
    },
  };
}

function createExecutionContext(metadata?: string): ExecutionContext {
  const handler = jest.fn();
  if (metadata !== undefined) {
    Reflect.defineMetadata('authorization:permission', metadata, handler);
  }
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        authentication: {
          subject: IDENTITY_ID.value,
          sessionId: 'session-1',
        },
      }),
    }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

describe('OrderSelfServicePermissionGuard (M08-M4)', () => {
  it('grants when the profile resolves and the engine returns granted', async () => {
    const authorization = {
      authorize: jest.fn().mockResolvedValue({ granted: true }),
    } as unknown as AuthorizationApplicationService;
    const customers = {
      findByIdentityId: jest.fn().mockResolvedValue(createMockProfile()),
    } as unknown as CustomerProfileRepository;

    const guard = new OrderSelfServicePermissionGuard(authorization, customers);
    const context = createExecutionContext('order.read');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: IDENTITY_ID,
      permissionId: 'order.read',
      sessionIdentifier: 'session-1',
      resourceReference: CUSTOMER_PROFILE_ID,
    });
  });

  it('denies when the profile is not found (no customer profile)', async () => {
    const authorization = {
      authorize: jest.fn(),
    } as unknown as AuthorizationApplicationService;
    const customers = {
      findByIdentityId: jest.fn().mockResolvedValue(null),
    } as unknown as CustomerProfileRepository;

    const guard = new OrderSelfServicePermissionGuard(authorization, customers);
    const context = createExecutionContext('order.read');

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(authorization.authorize).not.toHaveBeenCalled();
  });

  it('denies when no authentication claims are present', async () => {
    const authorization = {
      authorize: jest.fn(),
    } as unknown as AuthorizationApplicationService;
    const customers = {
      findByIdentityId: jest.fn(),
    } as unknown as CustomerProfileRepository;

    const guard = new OrderSelfServicePermissionGuard(authorization, customers);
    const handler = jest.fn();
    Reflect.defineMetadata('authorization:permission', 'order.read', handler);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
      getHandler: () => handler,
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(customers.findByIdentityId).not.toHaveBeenCalled();
  });

  it('denies when no permission metadata is declared', async () => {
    const authorization = {
      authorize: jest.fn(),
    } as unknown as AuthorizationApplicationService;
    const customers = {
      findByIdentityId: jest.fn(),
    } as unknown as CustomerProfileRepository;

    const guard = new OrderSelfServicePermissionGuard(authorization, customers);
    const context = createExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(customers.findByIdentityId).not.toHaveBeenCalled();
  });

  it('denies when the authorization engine returns denied', async () => {
    const authorization = {
      authorize: jest.fn().mockResolvedValue({ granted: false }),
    } as unknown as AuthorizationApplicationService;
    const customers = {
      findByIdentityId: jest.fn().mockResolvedValue(createMockProfile()),
    } as unknown as CustomerProfileRepository;

    const guard = new OrderSelfServicePermissionGuard(authorization, customers);
    const context = createExecutionContext('order.create');

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('fails closed when the profile lookup throws', async () => {
    const authorization = {
      authorize: jest.fn(),
    } as unknown as AuthorizationApplicationService;
    const customers = {
      findByIdentityId: jest.fn().mockRejectedValue(new Error('db failure')),
    } as unknown as CustomerProfileRepository;

    const guard = new OrderSelfServicePermissionGuard(authorization, customers);
    const context = createExecutionContext('order.read');

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(authorization.authorize).not.toHaveBeenCalled();
  });

  it('fails closed when the authorization engine throws', async () => {
    const authorization = {
      authorize: jest.fn().mockRejectedValue(new Error('engine failure')),
    } as unknown as AuthorizationApplicationService;
    const customers = {
      findByIdentityId: jest.fn().mockResolvedValue(createMockProfile()),
    } as unknown as CustomerProfileRepository;

    const guard = new OrderSelfServicePermissionGuard(authorization, customers);
    const context = createExecutionContext('order.read');

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
