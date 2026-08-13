import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import { AuthorizationDecision } from '../../../authorization/domain/authorization-decision';
import { Module02SellerAdminAuthorizationAdapter } from './module02-seller-admin-authorization.adapter';

const ADMIN_IDENTITY = new UuidV7('0191310f-789a-7123-8123-000000000001');

function grantedDecision(): AuthorizationDecision {
  return new AuthorizationDecision({
    outcome: 'GRANTED',
    authorizationReference: 'azr:test-grant',
  });
}

function deniedDecision(): AuthorizationDecision {
  return new AuthorizationDecision({
    outcome: 'DENIED',
    denialReason: 'PERMISSION_NOT_GRANTED',
    authorizationReference: 'azr:test-deny',
  });
}

describe('Module02SellerAdminAuthorizationAdapter (D-11)', () => {
  it('grants seller.review.decide through the Module 02 engine', async () => {
    const authorize = jest.fn().mockResolvedValue(grantedDecision());
    const adapter = new Module02SellerAdminAuthorizationAdapter({
      authorize,
    } as unknown as AuthorizationApplicationService);

    const granted = await adapter.isGranted(ADMIN_IDENTITY, 'seller.review.decide');

    expect(granted).toBe(true);
    expect(authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN_IDENTITY,
      permissionId: 'seller.review.decide',
    });
  });

  it('maps the review claim action onto the approved seller.review.decide permission', async () => {
    const authorize = jest.fn().mockResolvedValue(grantedDecision());
    const adapter = new Module02SellerAdminAuthorizationAdapter({
      authorize,
    } as unknown as AuthorizationApplicationService);

    await adapter.isGranted(ADMIN_IDENTITY, 'seller.review.claim');

    expect(authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN_IDENTITY,
      permissionId: 'seller.review.decide',
    });
  });

  it('maps suspension management onto the approved seller.suspend.manage permission', async () => {
    const authorize = jest.fn().mockResolvedValue(grantedDecision());
    const adapter = new Module02SellerAdminAuthorizationAdapter({
      authorize,
    } as unknown as AuthorizationApplicationService);

    await adapter.isGranted(ADMIN_IDENTITY, 'seller.suspend.manage');

    expect(authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN_IDENTITY,
      permissionId: 'seller.suspend.manage',
    });
  });

  it('maps evidence inspection onto the approved seller.evidence.read permission', async () => {
    const authorize = jest.fn().mockResolvedValue(grantedDecision());
    const adapter = new Module02SellerAdminAuthorizationAdapter({
      authorize,
    } as unknown as AuthorizationApplicationService);

    await adapter.isGranted(ADMIN_IDENTITY, 'seller.evidence.read');

    expect(authorize).toHaveBeenCalledWith({
      subjectIdentityId: ADMIN_IDENTITY,
      permissionId: 'seller.evidence.read',
    });
  });

  it('denies when the Module 02 engine denies (no implicit grant)', async () => {
    const authorize = jest.fn().mockResolvedValue(deniedDecision());
    const adapter = new Module02SellerAdminAuthorizationAdapter({
      authorize,
    } as unknown as AuthorizationApplicationService);

    const granted = await adapter.isGranted(ADMIN_IDENTITY, 'seller.review.decide');

    expect(granted).toBe(false);
  });

  it('fails closed for legal-hold management (no approved permission identifier)', async () => {
    const authorize = jest.fn();
    const adapter = new Module02SellerAdminAuthorizationAdapter({
      authorize,
    } as unknown as AuthorizationApplicationService);

    const granted = await adapter.isGranted(ADMIN_IDENTITY, 'seller.legalhold.manage');

    // Deny by default: no approved WEMP-M03-AUTHZ-001 identifier exists for
    // legal-hold management, so the Module 02 engine is never even consulted —
    // mapping it onto another permission would be an implicit grant.
    expect(granted).toBe(false);
    expect(authorize).not.toHaveBeenCalled();
  });

  it('fails closed when the engine errors (deny, never an implicit grant)', async () => {
    const authorize = jest.fn().mockRejectedValue(new Error('engine unavailable'));
    const adapter = new Module02SellerAdminAuthorizationAdapter({
      authorize,
    } as unknown as AuthorizationApplicationService);

    await expect(adapter.isGranted(ADMIN_IDENTITY, 'seller.review.decide')).resolves.toBe(false);
    expect(authorize).toHaveBeenCalledTimes(1);
  });
});
