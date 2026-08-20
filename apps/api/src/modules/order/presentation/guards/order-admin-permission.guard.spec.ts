/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { OrderAdminAuthorizationPort } from '../../application/ports/order-admin-authorization.port';
import { OrderAdminPermissionGuard } from './order-admin-permission.guard';

const IDENTITY_ID = new UuidV7('0191310f-789a-7000-8000-000000000010');

function createExecutionContext(metadata?: string): ExecutionContext {
  const handler = jest.fn();
  if (metadata !== undefined) {
    Reflect.defineMetadata('order:adminAction', metadata, handler);
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

describe('OrderAdminPermissionGuard (M08-M4)', () => {
  it('grants when the admin authorization port returns granted', async () => {
    const adminAuth: OrderAdminAuthorizationPort = {
      isGranted: jest.fn().mockResolvedValue(true),
    };
    const guard = new OrderAdminPermissionGuard(adminAuth);
    const context = createExecutionContext('order.admin.read');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(adminAuth.isGranted).toHaveBeenCalledWith(IDENTITY_ID, 'order.admin.read');
  });

  it('denies when the admin authorization port returns denied', async () => {
    const adminAuth: OrderAdminAuthorizationPort = {
      isGranted: jest.fn().mockResolvedValue(false),
    };
    const guard = new OrderAdminPermissionGuard(adminAuth);
    const context = createExecutionContext('order.admin.manage');

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies when no authentication claims are present', async () => {
    const adminAuth: OrderAdminAuthorizationPort = {
      isGranted: jest.fn(),
    };
    const guard = new OrderAdminPermissionGuard(adminAuth);
    const handler = jest.fn();
    Reflect.defineMetadata('order:adminAction', 'order.admin.read', handler);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
      getHandler: () => handler,
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(adminAuth.isGranted).not.toHaveBeenCalled();
  });

  it('denies when no admin action metadata is declared', async () => {
    const adminAuth: OrderAdminAuthorizationPort = {
      isGranted: jest.fn(),
    };
    const guard = new OrderAdminPermissionGuard(adminAuth);
    const context = createExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(adminAuth.isGranted).not.toHaveBeenCalled();
  });

  it('fails closed (denies) when the admin authorization port throws', async () => {
    const adminAuth: OrderAdminAuthorizationPort = {
      isGranted: jest.fn().mockRejectedValue(new Error('engine failure')),
    };
    const guard = new OrderAdminPermissionGuard(adminAuth);
    const context = createExecutionContext('order.admin.read');

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
