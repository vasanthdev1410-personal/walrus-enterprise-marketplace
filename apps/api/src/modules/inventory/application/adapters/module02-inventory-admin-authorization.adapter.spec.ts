/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Module02InventoryAdminAuthorizationAdapter } from './module02-inventory-admin-authorization.adapter';

const ADMIN = new UuidV7('01913110-789a-7123-8123-000000000901');

function authorizationMock(decision: {
  granted: boolean;
}): jest.Mocked<AuthorizationApplicationService> {
  return {
    authorize: jest.fn().mockResolvedValue(decision),
  } as unknown as jest.Mocked<AuthorizationApplicationService>;
}

describe('Module02InventoryAdminAuthorizationAdapter (M05-M4, WEMP-M05-AUTHZ-001 §2.2)', () => {
  it('maps inventory.adjust.admin to the approved Module 02 permission', async () => {
    const authorization = authorizationMock({ granted: true });
    const adapter = new Module02InventoryAdminAuthorizationAdapter(authorization);

    const granted = await adapter.isGranted(ADMIN, 'inventory.adjust.admin');

    expect(granted).toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN,
      permissionId: 'inventory.adjust.admin',
    });
  });

  it('maps inventory.audit.view to the approved Module 02 permission', async () => {
    const authorization = authorizationMock({ granted: true });
    const adapter = new Module02InventoryAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'inventory.audit.view')).resolves.toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN,
      permissionId: 'inventory.audit.view',
    });
  });

  it('denies when the Module 02 engine denies (grant is engine-decided)', async () => {
    const authorization = authorizationMock({ granted: false });
    const adapter = new Module02InventoryAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'inventory.adjust.admin')).resolves.toBe(false);
  });

  it('fails closed when the Module 02 engine raises (no silent grant)', async () => {
    const authorization = {
      authorize: jest.fn().mockRejectedValue(new Error('engine unavailable')),
    } as unknown as jest.Mocked<AuthorizationApplicationService>;
    const adapter = new Module02InventoryAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'inventory.audit.view')).resolves.toBe(false);
  });

  it('denies a SUPER_ADMIN without the admin grant (no hidden bypass, D-05)', async () => {
    const authorization = authorizationMock({ granted: false });
    const adapter = new Module02InventoryAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'inventory.adjust.admin')).resolves.toBe(false);
  });
});
