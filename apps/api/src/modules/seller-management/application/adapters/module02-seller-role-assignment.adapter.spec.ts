import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../../authorization/application/services/authorization-application.service';
import type { IdentityRoleAssignmentRepository } from '../../../authorization/domain/repositories/identity-role-assignment-repository';
import { IdentityRoleAssignment } from '../../../authorization/domain/entities/identity-role-assignment';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { Module02SellerRoleAssignmentAdapter } from './module02-seller-role-assignment.adapter';

const IDENTITY_ID = new UuidV7('0191310f-789a-7123-8123-000000000001');
const SELLER_PROFILE_ID = new UuidV7('0191310f-789a-7123-8123-000000000002');
const ADMIN_IDENTITY = new UuidV7('0191310f-789a-7123-8123-000000000003');
const NOW = new Date('2026-08-13T00:00:00.000Z');

function sellerAssignment(): IdentityRoleAssignment {
  return new IdentityRoleAssignment({
    assignmentId: new UuidV7('0191310f-789a-7123-8123-000000000004'),
    identityId: IDENTITY_ID,
    roleName: 'SELLER',
    assignmentState: 'ACTIVE',
    assignmentOriginType: 'SELLER_LIFECYCLE',
    assignedByWorkloadIdentity: 'walrus.module-03.seller-lifecycle',
    authorityEvidenceReference: 'seller:test',
    operationId: SELLER_PROFILE_ID,
    assignedAt: NOW,
    aggregateVersion: new AggregateVersion(1),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('Module02SellerRoleAssignmentAdapter (D-11)', () => {
  it('reports whether the identity holds an ACTIVE SELLER role assignment', async () => {
    const findActiveByIdentityId = jest
      .fn<Promise<readonly unknown[]>, [unknown]>()
      .mockImplementation((identity: unknown) =>
        Promise.resolve(
          (identity as { value: string }).value === IDENTITY_ID.value ? [sellerAssignment()] : [],
        ),
      );
    const adapter = new Module02SellerRoleAssignmentAdapter(
      {} as unknown as AuthorizationApplicationService,
      { findActiveByIdentityId } as unknown as IdentityRoleAssignmentRepository,
    );

    expect(await adapter.isSellerRoleGranted(IDENTITY_ID)).toBe(true);
    expect(
      await adapter.isSellerRoleGranted(new UuidV7('0191310f-789a-7123-8123-0000000000aa')),
    ).toBe(false);
  });

  it('forwards the role-assignment request to the Module 02 service', async () => {
    const assignSellerRoleForActivation = jest.fn().mockResolvedValue({ outcome: 'GRANTED' });
    const adapter = new Module02SellerRoleAssignmentAdapter(
      { assignSellerRoleForActivation } as unknown as AuthorizationApplicationService,
      {} as unknown as IdentityRoleAssignmentRepository,
    );

    const result = await adapter.requestSellerRoleAssignment({
      targetIdentityId: IDENTITY_ID,
      sellerProfileId: SELLER_PROFILE_ID,
      correlationId: '0191310f-789a-7123-8123-000000000005',
    });

    expect(result).toEqual({ outcome: 'GRANTED' });
    expect(assignSellerRoleForActivation).toHaveBeenCalledWith({
      targetIdentityId: IDENTITY_ID,
      sellerProfileId: SELLER_PROFILE_ID,
      authorityEvidenceReference: `seller:${SELLER_PROFILE_ID.value}`,
      correlationId: '0191310f-789a-7123-8123-000000000005',
    });
  });

  it('propagates a DENIED outcome unchanged', async () => {
    const assignSellerRoleForActivation = jest
      .fn()
      .mockResolvedValue({ outcome: 'DENIED', reason: 'SELLER_STATE_INELIGIBLE' });
    const adapter = new Module02SellerRoleAssignmentAdapter(
      { assignSellerRoleForActivation } as unknown as AuthorizationApplicationService,
      {} as unknown as IdentityRoleAssignmentRepository,
    );

    const result = await adapter.requestSellerRoleAssignment({
      targetIdentityId: IDENTITY_ID,
      sellerProfileId: SELLER_PROFILE_ID,
    });

    expect(result).toMatchObject({ outcome: 'DENIED', reason: 'SELLER_STATE_INELIGIBLE' });
  });

  it('maps a Module 02 error to FAILED (fail closed, never a silent grant)', async () => {
    const assignSellerRoleForActivation = jest.fn().mockRejectedValue(new Error('boom'));
    const adapter = new Module02SellerRoleAssignmentAdapter(
      { assignSellerRoleForActivation } as unknown as AuthorizationApplicationService,
      {} as unknown as IdentityRoleAssignmentRepository,
    );

    const result = await adapter.requestSellerRoleAssignment({
      targetIdentityId: IDENTITY_ID,
      sellerProfileId: SELLER_PROFILE_ID,
    });

    expect(result).toMatchObject({ outcome: 'FAILED', reason: 'ASSIGNMENT_FAILED' });
  });

  it('forwards a revocation request to the Module 02 service', async () => {
    const revokeSellerRole = jest.fn().mockResolvedValue({ outcome: 'GRANTED' });
    const adapter = new Module02SellerRoleAssignmentAdapter(
      { revokeSellerRole } as unknown as AuthorizationApplicationService,
      {} as unknown as IdentityRoleAssignmentRepository,
    );

    const result = await adapter.revokeSellerRole({
      identityId: IDENTITY_ID,
      revokedByIdentityId: ADMIN_IDENTITY,
      reasonReference: 'seller.closed',
    });

    expect(result).toEqual({ outcome: 'GRANTED' });
    expect(revokeSellerRole).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      revokedByIdentityId: ADMIN_IDENTITY,
      reasonReference: 'seller.closed',
    });
  });

  it('maps a revocation error to FAILED (fail closed)', async () => {
    const revokeSellerRole = jest.fn().mockRejectedValue(new Error('boom'));
    const adapter = new Module02SellerRoleAssignmentAdapter(
      { revokeSellerRole } as unknown as AuthorizationApplicationService,
      {} as unknown as IdentityRoleAssignmentRepository,
    );

    const result = await adapter.revokeSellerRole({ identityId: IDENTITY_ID });

    expect(result).toMatchObject({ outcome: 'FAILED', reason: 'REVOCATION_FAILED' });
  });
});
