import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CartAdminAuthorizationPort } from '../../application/ports/cart-admin-authorization.port';
import { CartAdminPermissionGuard } from './cart-admin-permission.guard';

function mockContext(
  overrides: { authentication?: { subject: string; sessionId: string }; action?: unknown } = {},
): ExecutionContext {
  const handler = (): void => undefined;
  if (overrides.action !== undefined) {
    Reflect.defineMetadata('cart:adminAction', overrides.action, handler);
  }
  return {
    switchToHttp: () => ({
      getRequest: () =>
        ({
          ...(overrides.authentication != null ? { authentication: overrides.authentication } : {}),
        }) as Request,
    }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

describe('CartAdminPermissionGuard', () => {
  const isGranted = jest.fn();
  const adminAuth = { isGranted } as unknown as CartAdminAuthorizationPort;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws ForbiddenException when claims are undefined', async () => {
    const guard = new CartAdminPermissionGuard(adminAuth);
    await expect(guard.canActivate(mockContext({}))).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when action metadata is not a string', async () => {
    const guard = new CartAdminPermissionGuard(adminAuth);
    const ctx = mockContext({
      authentication: { subject: '0191310f-789a-7123-8123-000000000001', sessionId: 'sess-1' },
      action: 123,
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when adminAuth returns false', async () => {
    isGranted.mockResolvedValue(false);
    const guard = new CartAdminPermissionGuard(adminAuth);
    const ctx = mockContext({
      authentication: { subject: '0191310f-789a-7123-8123-000000000001', sessionId: 'sess-1' },
      action: 'cart.admin.read',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('returns true when adminAuth grants', async () => {
    isGranted.mockResolvedValue(true);
    const guard = new CartAdminPermissionGuard(adminAuth);
    const ctx = mockContext({
      authentication: { subject: '0191310f-789a-7123-8123-000000000001', sessionId: 'sess-1' },
      action: 'cart.admin.manage',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws ForbiddenException when adminAuth throws non-ForbiddenException', async () => {
    isGranted.mockRejectedValue(new Error('DB connection failed'));
    const guard = new CartAdminPermissionGuard(adminAuth);
    const ctx = mockContext({
      authentication: { subject: '0191310f-789a-7123-8123-000000000001', sessionId: 'sess-1' },
      action: 'cart.admin.read',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
