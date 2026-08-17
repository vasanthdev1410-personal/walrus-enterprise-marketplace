import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { PERMISSION_METADATA_KEY } from '../../../authorization/presentation/guards/authorization-permission.guard';
import type { Module04ProductCatalogReadPort } from '../../domain/ports/module-04-product-catalog.port';
import { InventorySellerPermissionGuard } from './inventory-seller-permission.guard';

const IDENTITY = new UuidV7('01900000-0000-7000-8000-000000000001');
const SELLER = new UuidV7('01900000-0000-7000-8000-000000000003');
const OTHER_SELLER = new UuidV7('01900000-0000-7000-8000-000000000004');
const SKU = new UuidV7('01900000-0000-7000-8000-000000000005');

const PERMISSION = 'inventory.read';

interface Dependencies {
  authorization: { authorize: () => Promise<{ granted: boolean }> };
  module04: Module04ProductCatalogReadPort;
}

function createGuard(overrides: Partial<Dependencies> = {}): {
  guard: InventorySellerPermissionGuard;
  deps: Dependencies;
} {
  const deps: Dependencies = {
    authorization: {
      authorize: jest.fn().mockResolvedValue({ granted: true }),
    },
    module04: {
      getConsumableSkuFact: jest.fn().mockResolvedValue({
        skuId: SKU,
        sellerProfileId: SELLER,
        skuCode: 'WLR-ESPRESSO-001',
        state: 'ACTIVE',
      }),
    },
    ...overrides,
  };
  return {
    guard: new InventorySellerPermissionGuard(deps.authorization as never, deps.module04),
    deps,
  };
}

function contextOf(request: unknown, withPermission = true): ExecutionContext {
  const handler = (): void => undefined;
  if (withPermission) {
    Reflect.defineMetadata(PERMISSION_METADATA_KEY, PERMISSION, handler);
  }
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext & { getHandler(): unknown };
}

describe('InventorySellerPermissionGuard (M05-M5, D-05/D-10/D-15)', () => {
  it('allows a seller read of their own organization inventory', async () => {
    const { guard, deps } = createGuard();
    const context = contextOf({
      authentication: {
        subject: IDENTITY.value,
        sessionId: 'session-1',
      },
      query: { sellerProfileId: SELLER.value },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(deps.authorization.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectIdentityId: IDENTITY,
        permissionId: PERMISSION,
        resourceReference: SELLER,
      }),
    );
  });

  it('denies without a declared permission (fail closed)', async () => {
    const { guard } = createGuard();
    const context = contextOf(
      {
        authentication: { subject: IDENTITY.value, sessionId: 'session-1' },
        query: { sellerProfileId: SELLER.value },
      },
      false,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('AUTHORIZATION_DENIED'),
    );
  });

  it('denies without authentication claims (fail closed)', async () => {
    const { guard } = createGuard();
    const context = contextOf({ query: { sellerProfileId: SELLER.value } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('AUTHORIZATION_DENIED'),
    );
  });

  it('denies a missing seller reference (fail closed)', async () => {
    const { guard } = createGuard();
    const context = contextOf({
      authentication: { subject: IDENTITY.value, sessionId: 'session-1' },
      query: {},
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('AUTHORIZATION_DENIED'),
    );
  });

  it('denies a malformed seller reference (fail closed)', async () => {
    const { guard } = createGuard();
    const context = contextOf({
      authentication: { subject: IDENTITY.value, sessionId: 'session-1' },
      query: { sellerProfileId: 'not-a-uuid' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('AUTHORIZATION_DENIED'),
    );
  });

  it('denies a SKU whose fact resolves to another organization (D-15)', async () => {
    const { guard, deps } = createGuard();
    deps.module04.getConsumableSkuFact = jest.fn().mockResolvedValue({
      skuId: SKU,
      sellerProfileId: OTHER_SELLER,
      skuCode: 'OTHER-SKU',
      state: 'ACTIVE',
    });
    const context = contextOf({
      authentication: { subject: IDENTITY.value, sessionId: 'session-1' },
      query: { sellerProfileId: SELLER.value },
      params: { skuId: SKU.value },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('AUTHORIZATION_DENIED'),
    );
    expect(deps.authorization.authorize).not.toHaveBeenCalled();
  });

  it('denies a SKU with an unknown/null fact (fail closed, anti-enumeration)', async () => {
    const { guard, deps } = createGuard();
    deps.module04.getConsumableSkuFact = jest.fn().mockResolvedValue(null);
    const context = contextOf({
      authentication: { subject: IDENTITY.value, sessionId: 'session-1' },
      query: { sellerProfileId: SELLER.value },
      params: { skuId: SKU.value },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('AUTHORIZATION_DENIED'),
    );
  });

  it('denies when the Module 02 engine denies the grant', async () => {
    const { guard, deps } = createGuard();
    deps.authorization.authorize = jest.fn().mockResolvedValue({ granted: false });
    const context = contextOf({
      authentication: { subject: IDENTITY.value, sessionId: 'session-1' },
      query: { sellerProfileId: SELLER.value },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('AUTHORIZATION_DENIED'),
    );
  });

  it('fails closed when the authorization engine throws', async () => {
    const { guard, deps } = createGuard();
    deps.authorization.authorize = jest.fn().mockRejectedValue(new Error('engine unavailable'));
    const context = contextOf({
      authentication: { subject: IDENTITY.value, sessionId: 'session-1' },
      query: { sellerProfileId: SELLER.value },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('AUTHORIZATION_DENIED'),
    );
  });

  it('stores the validated seller scope for the controller', async () => {
    const { guard } = createGuard();
    const request = {
      authentication: { subject: IDENTITY.value, sessionId: 'session-1' },
      query: { sellerProfileId: SELLER.value },
    } as never;
    const context = contextOf(request);

    await guard.canActivate(context);

    expect(
      (request as { inventorySellerContext: { sellerProfileId: UuidV7 } }).inventorySellerContext
        .sellerProfileId.value,
    ).toBe(SELLER.value);
  });
});
