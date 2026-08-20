/* eslint-disable @typescript-eslint/unbound-method */
import { Module02PaymentAdminAuthorizationAdapter } from './module02-payment-admin-authorization.adapter';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

function makeIdentityId(): UuidV7 {
  return new UuidV7('0192a000-1000-7000-8000-000000000001');
}

function createMockAuthorization(outcome: 'GRANTED' | 'DENIED'): AuthorizationApplicationService {
  return {
    authorize: jest.fn().mockResolvedValue({ granted: outcome === 'GRANTED' }),
  } as unknown as AuthorizationApplicationService;
}

function createFailingAuthorization(): AuthorizationApplicationService {
  return {
    authorize: jest.fn().mockRejectedValue(new Error('engine failure')),
  } as unknown as AuthorizationApplicationService;
}

describe('Module02PaymentAdminAuthorizationAdapter', () => {
  it('returns true when the authorization engine grants', async () => {
    const authorization = createMockAuthorization('GRANTED');
    const adapter = new Module02PaymentAdminAuthorizationAdapter(authorization);

    const granted = await adapter.isGranted(makeIdentityId(), 'payment.admin.read');

    expect(granted).toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: makeIdentityId(),
      permissionId: 'payment.admin.read',
    });
  });

  it('returns false when the authorization engine denies', async () => {
    const authorization = createMockAuthorization('DENIED');
    const adapter = new Module02PaymentAdminAuthorizationAdapter(authorization);

    const granted = await adapter.isGranted(makeIdentityId(), 'payment.admin.manage');

    expect(granted).toBe(false);
    expect(authorization.authorize).toHaveBeenCalledWith({
      subjectIdentityId: makeIdentityId(),
      permissionId: 'payment.admin.manage',
    });
  });

  it('returns false (fail closed) when the authorization engine throws', async () => {
    const authorization = createFailingAuthorization();
    const adapter = new Module02PaymentAdminAuthorizationAdapter(authorization);

    const granted = await adapter.isGranted(makeIdentityId(), 'payment.admin.read');

    expect(granted).toBe(false);
  });
});
