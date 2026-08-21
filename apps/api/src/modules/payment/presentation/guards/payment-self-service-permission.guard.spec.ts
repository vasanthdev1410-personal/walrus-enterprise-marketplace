import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PaymentSelfServicePermissionGuard } from './payment-self-service-permission.guard';
import { PERMISSION_METADATA_KEY } from '../../../authorization/presentation/guards/authorization-permission.guard';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import type { CustomerProfileRepository } from '../../../customer/domain/ports/customer-repository.port';

function makeIdentityId(): UuidV7 {
  return new UuidV7('0192a000-1000-7000-8000-000000000001');
}

interface MockContextOptions {
  readonly permissionId?: string;
  readonly hasClaims?: boolean;
  readonly subject?: string;
  readonly sessionId?: string;
}

function createMockContext(overrides: MockContextOptions): ExecutionContext {
  const handler = (): never => {
    throw new Error('never called');
  };
  if (overrides.permissionId !== undefined) {
    Reflect.defineMetadata(PERMISSION_METADATA_KEY, overrides.permissionId, handler);
  }

  const claims =
    overrides.hasClaims !== false
      ? {
          subject: overrides.subject ?? makeIdentityId().value,
          sessionId: overrides.sessionId ?? 'session-001',
        }
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

function createMockAuthorization(outcome: 'GRANTED' | 'DENIED'): AuthorizationApplicationService {
  return {
    authorize: jest.fn().mockResolvedValue({ granted: outcome === 'GRANTED' }),
  } as unknown as AuthorizationApplicationService;
}

function createMockCustomers(profileId?: UuidV7): CustomerProfileRepository {
  return {
    findByIdentityId: jest
      .fn()
      .mockResolvedValue(
        profileId !== undefined ? { properties: { customerProfileId: profileId } } : null,
      ),
  } as unknown as CustomerProfileRepository;
}

describe('PaymentSelfServicePermissionGuard', () => {
  it('allows when permission is granted and profile is resolved', async () => {
    const profileId = new UuidV7('0192a000-2000-7000-8000-000000000001');
    const guard = new PaymentSelfServicePermissionGuard(
      createMockAuthorization('GRANTED'),
      createMockCustomers(profileId),
    );
    const context = createMockContext({ permissionId: 'payment.read' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('denies when no permission metadata is declared', async () => {
    const guard = new PaymentSelfServicePermissionGuard(
      createMockAuthorization('GRANTED'),
      createMockCustomers(),
    );
    const context = createMockContext({ hasClaims: true });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies when no authentication claims', async () => {
    const guard = new PaymentSelfServicePermissionGuard(
      createMockAuthorization('GRANTED'),
      createMockCustomers(),
    );
    const context = createMockContext({ hasClaims: false, permissionId: 'payment.read' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies when customer profile is not found', async () => {
    const guard = new PaymentSelfServicePermissionGuard(
      createMockAuthorization('GRANTED'),
      createMockCustomers(),
    );
    const context = createMockContext({ permissionId: 'payment.read' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies when authorization engine denies', async () => {
    const profileId = new UuidV7('0192a000-2000-7000-8000-000000000001');
    const guard = new PaymentSelfServicePermissionGuard(
      createMockAuthorization('DENIED'),
      createMockCustomers(profileId),
    );
    const context = createMockContext({ permissionId: 'payment.read' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies when authorization engine throws (fail closed)', async () => {
    const profileId = new UuidV7('0192a000-2000-7000-8000-000000000001');
    const authorization = {
      authorize: jest.fn().mockRejectedValue(new Error('engine failure')),
    } as unknown as AuthorizationApplicationService;
    const guard = new PaymentSelfServicePermissionGuard(
      authorization,
      createMockCustomers(profileId),
    );
    const context = createMockContext({ permissionId: 'payment.read' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies when customer resolution throws (fail closed)', async () => {
    const customers = {
      findByIdentityId: jest.fn().mockRejectedValue(new Error('db failure')),
    } as unknown as CustomerProfileRepository;
    const guard = new PaymentSelfServicePermissionGuard(
      createMockAuthorization('GRANTED'),
      customers,
    );
    const context = createMockContext({ permissionId: 'payment.read' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
