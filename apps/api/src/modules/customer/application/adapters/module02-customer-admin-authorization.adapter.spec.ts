/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Module02CustomerAdminAuthorizationAdapter } from './module02-customer-admin-authorization.adapter';

const ADMIN = new UuidV7('01913110-789a-7123-8123-000000000901');

function authorizationMock(decision: {
  granted: boolean;
}): jest.Mocked<AuthorizationApplicationService> {
  return {
    authorize: jest.fn().mockResolvedValue(decision),
  } as unknown as jest.Mocked<AuthorizationApplicationService>;
}

describe('Module02CustomerAdminAuthorizationAdapter (M06-M4, WEMP-M06-AUTHZ-001 §2.2)', () => {
  it('maps customer.read to the approved Module 02 permission', async () => {
    const authorization = authorizationMock({ granted: true });
    const adapter = new Module02CustomerAdminAuthorizationAdapter(authorization);

    const granted = await adapter.isGranted(ADMIN, 'customer.read');

    expect(granted).toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN,
      permissionId: 'customer.read',
    });
  });

  it('maps customer.lifecycle.manage to the approved Module 02 permission', async () => {
    const authorization = authorizationMock({ granted: true });
    const adapter = new Module02CustomerAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'customer.lifecycle.manage')).resolves.toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN,
      permissionId: 'customer.lifecycle.manage',
    });
  });

  it('maps customer.audit.view to the approved Module 02 permission', async () => {
    const authorization = authorizationMock({ granted: true });
    const adapter = new Module02CustomerAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'customer.audit.view')).resolves.toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN,
      permissionId: 'customer.audit.view',
    });
  });

  it('denies when the Module 02 engine denies (grant is engine-decided)', async () => {
    const authorization = authorizationMock({ granted: false });
    const adapter = new Module02CustomerAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'customer.lifecycle.manage')).resolves.toBe(false);
  });

  it('fails closed when the Module 02 engine raises (no silent grant)', async () => {
    const authorization = {
      authorize: jest.fn().mockRejectedValue(new Error('engine unavailable')),
    } as unknown as jest.Mocked<AuthorizationApplicationService>;
    const adapter = new Module02CustomerAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'customer.audit.view')).resolves.toBe(false);
  });

  it('denies an ADMIN without the explicit grant (no hidden bypass, D-07)', async () => {
    const authorization = authorizationMock({ granted: false });
    const adapter = new Module02CustomerAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'customer.read')).resolves.toBe(false);
  });
});
