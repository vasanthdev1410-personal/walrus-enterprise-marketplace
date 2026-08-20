/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { Module02OrderAdminAuthorizationAdapter } from './module02-order-admin-authorization.adapter';

const IDENTITY_ID = new UuidV7('0191310f-789a-7000-8000-000000000010');

describe('Module02OrderAdminAuthorizationAdapter (M08-M4)', () => {
  it('grants when the Module 02 engine returns granted for order.admin.read', async () => {
    const authorization = {
      authorize: jest.fn().mockResolvedValue({ granted: true }),
    } as unknown as AuthorizationApplicationService;

    const adapter = new Module02OrderAdminAuthorizationAdapter(authorization);
    const result = await adapter.isGranted(IDENTITY_ID, 'order.admin.read');

    expect(result).toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: IDENTITY_ID,
      permissionId: 'order.admin.read',
    });
  });

  it('grants when the Module 02 engine returns granted for order.admin.manage', async () => {
    const authorization = {
      authorize: jest.fn().mockResolvedValue({ granted: true }),
    } as unknown as AuthorizationApplicationService;

    const adapter = new Module02OrderAdminAuthorizationAdapter(authorization);
    const result = await adapter.isGranted(IDENTITY_ID, 'order.admin.manage');

    expect(result).toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: IDENTITY_ID,
      permissionId: 'order.admin.manage',
    });
  });

  it('denies when the Module 02 engine returns denied', async () => {
    const authorization = {
      authorize: jest.fn().mockResolvedValue({ granted: false }),
    } as unknown as AuthorizationApplicationService;

    const adapter = new Module02OrderAdminAuthorizationAdapter(authorization);
    const result = await adapter.isGranted(IDENTITY_ID, 'order.admin.read');

    expect(result).toBe(false);
  });

  it('fails closed (denies) when the Module 02 engine throws', async () => {
    const authorization = {
      authorize: jest.fn().mockRejectedValue(new Error('engine failure')),
    } as unknown as AuthorizationApplicationService;

    const adapter = new Module02OrderAdminAuthorizationAdapter(authorization);
    const result = await adapter.isGranted(IDENTITY_ID, 'order.admin.manage');

    expect(result).toBe(false);
  });
});
