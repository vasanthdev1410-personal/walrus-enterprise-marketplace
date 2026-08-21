import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PaymentAdminPermissionGuard } from './payment-admin-permission.guard';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PaymentAdminAuthorizationPort } from '../../application/ports/payment-admin-authorization.port';

function makeIdentityId(): UuidV7 {
  return new UuidV7('0192a000-1000-7000-8000-000000000001');
}

interface MockContextOptions {
  readonly adminAction?: string;
  readonly hasClaims?: boolean;
  readonly subject?: string;
}

function createMockContext(overrides: MockContextOptions): ExecutionContext {
  const handler = (): never => {
    throw new Error('never called');
  };
  if (overrides.adminAction !== undefined) {
    Reflect.defineMetadata('payment:adminAction', overrides.adminAction, handler);
  }

  const claims =
    overrides.hasClaims !== false
      ? { subject: overrides.subject ?? makeIdentityId().value }
      : undefined;

  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        authentication: claims,
      }),
    }),
  } as unknown as ExecutionContext;
}

function createMockAdminAuth(outcome: boolean): PaymentAdminAuthorizationPort {
  return {
    isGranted: jest.fn().mockResolvedValue(outcome),
  };
}

describe('PaymentAdminPermissionGuard', () => {
  it('allows when admin action is granted', async () => {
    const guard = new PaymentAdminPermissionGuard(createMockAdminAuth(true));
    const context = createMockContext({ adminAction: 'payment.admin.read' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('denies when no admin action metadata is declared', async () => {
    const guard = new PaymentAdminPermissionGuard(createMockAdminAuth(true));
    const context = createMockContext({ hasClaims: true });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies when no authentication claims', async () => {
    const guard = new PaymentAdminPermissionGuard(createMockAdminAuth(true));
    const context = createMockContext({ hasClaims: false, adminAction: 'payment.admin.read' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies when admin authorization port denies', async () => {
    const guard = new PaymentAdminPermissionGuard(createMockAdminAuth(false));
    const context = createMockContext({ adminAction: 'payment.admin.manage' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies when admin authorization port throws (fail closed)', async () => {
    const adminAuth: PaymentAdminAuthorizationPort = {
      isGranted: jest.fn().mockRejectedValue(new Error('engine failure')),
    };
    const guard = new PaymentAdminPermissionGuard(adminAuth);
    const context = createMockContext({ adminAction: 'payment.admin.read' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
