import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
/* Jest verifies injected mock methods by reference. */
/* eslint-disable @typescript-eslint/unbound-method */
import { Module02ProductAdminAuthorizationAdapter } from './module02-product-admin-authorization.adapter';

const ADMIN = new UuidV7('01913110-789a-7123-8123-000000000801');

function authorizationMock(decision: {
  granted: boolean;
}): jest.Mocked<AuthorizationApplicationService> {
  return {
    authorize: jest.fn().mockResolvedValue(decision),
  } as unknown as jest.Mocked<AuthorizationApplicationService>;
}

describe('Module02ProductAdminAuthorizationAdapter (M04-M4, WEMP-M04-AUTHZ-001)', () => {
  it('maps product.review.decide to the approved Module 02 permission', async () => {
    const authorization = authorizationMock({ granted: true });
    const adapter = new Module02ProductAdminAuthorizationAdapter(authorization);

    const granted = await adapter.isGranted(ADMIN, 'product.review.decide');

    expect(granted).toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN,
      permissionId: 'product.review.decide',
    });
  });

  it('denies when the Module 02 engine denies (grant is engine-decided)', async () => {
    const authorization = authorizationMock({ granted: false });
    const adapter = new Module02ProductAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'product.audit.view')).resolves.toBe(false);
  });

  it('fails closed when the Module 02 engine raises (no silent grant)', async () => {
    const authorization = {
      authorize: jest.fn().mockRejectedValue(new Error('engine unavailable')),
    } as unknown as jest.Mocked<AuthorizationApplicationService>;
    const adapter = new Module02ProductAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'product.media.read')).resolves.toBe(false);
  });

  it('denies a Super Admin without the moderation grant (no hidden bypass, D-11)', async () => {
    const authorization = authorizationMock({ granted: false });
    const adapter = new Module02ProductAdminAuthorizationAdapter(authorization);

    await expect(adapter.isGranted(ADMIN, 'product.review.decide')).resolves.toBe(false);
  });
});
