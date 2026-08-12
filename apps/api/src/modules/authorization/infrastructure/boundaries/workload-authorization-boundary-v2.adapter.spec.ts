/* eslint-disable @typescript-eslint/unbound-method */
import type { PrismaService } from '../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { PrivilegedActivationService } from '../../application/services/privileged-activation.service';
import { WorkloadAuthorizationBoundaryV2Adapter } from './workload-authorization-boundary-v2.adapter';

const ID = '0191310f-789a-7123-8123-000000000001';
const TARGET = '0191310f-789a-7123-8123-000000000002';
const expiry = new Date(Date.now() + 60_000);
const workload = { environment: 'development', operationId: ID, verificationReference: 'wi:1' };

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fixture() {
  const authority = {
    provisioningRecordId: ID,
    operationId: ID,
    targetIdentityId: TARGET,
    requestedRole: 'ADMIN',
    requestedClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
    environment: 'development',
    lifecycleState: 'RESERVED',
    aggregateVersion: 2,
    expiresAt: expiry,
  };
  const bootstrap = {
    bootstrapRecordId: ID,
    operationId: ID,
    intendedIdentityId: TARGET,
    environment: 'development',
    permanentlyClosed: false,
    lifecycleState: 'RESERVED',
    evidenceDigest: 'evidence',
    expiresAt: expiry,
  };
  const prisma = {
    provisioningAuthorityRecord: {
      findFirst: jest.fn().mockResolvedValue(authority),
      findUnique: jest.fn().mockResolvedValue(authority),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    bootstrapControlRecord: {
      findUnique: jest.fn().mockResolvedValue(bootstrap),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  const activation = {
    begin: jest.fn().mockResolvedValue(ID),
  } as unknown as PrivilegedActivationService;
  return {
    adapter: new WorkloadAuthorizationBoundaryV2Adapter(prisma, activation),
    prisma,
    activation,
    authority,
    bootstrap,
  };
}

describe('WorkloadAuthorizationBoundaryV2Adapter', () => {
  it('fails closed when trusted workload or signed evidence is absent', async () => {
    const { adapter } = fixture();
    await expect(adapter.validateContract({ workload: undefined } as never)).resolves.toEqual({
      contractValid: false,
    });
    await expect(adapter.authorizeProvisioning({ workload: undefined } as never)).resolves.toEqual({
      authorized: false,
    });
    await expect(adapter.authorizeBootstrap({ workload: undefined } as never)).resolves.toEqual({
      available: false,
    });
  });

  it('validates a classification contract only against durable authority', async () => {
    const { adapter, prisma } = fixture();
    await expect(
      adapter.validateContract({
        workload,
        sourceContractReference: 'prvref',
        targetIdentityId: new UuidV7(TARGET),
        targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      } as never),
    ).resolves.toMatchObject({ contractValid: true, contractReference: 'wi:1' });
    jest.mocked(prisma.provisioningAuthorityRecord.findFirst).mockResolvedValueOnce(null);
    await expect(
      adapter.validateContract({
        workload,
        sourceContractReference: 'bad',
        targetIdentityId: new UuidV7(TARGET),
        targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      } as never),
    ).resolves.toEqual({ contractValid: false });
  });

  it('reserves provisioning using optimistic concurrency and starts its saga', async () => {
    const { adapter, activation } = fixture();
    const authorized = await adapter.authorizeProvisioning({
      workload,
      provisioningAssertionDigest: 'evidence',
      provisioningReference: 'prvref',
    } as never);
    expect(authorized).toMatchObject({ authorized: true, operationId: ID });
    await adapter.completeProvisioning({
      operationId: ID,
      identityId: new UuidV7(TARGET),
      authorizationReference: 'wi:1',
    });
    expect(activation.begin).toHaveBeenCalledWith(
      expect.objectContaining({ sagaType: 'ADMIN_PROVISIONING' }),
    );
  });

  it('denies a lost provisioning race and invalid completion target', async () => {
    const { adapter, prisma } = fixture();
    jest.mocked(prisma.provisioningAuthorityRecord.updateMany).mockResolvedValueOnce({ count: 0 });
    await expect(
      adapter.authorizeProvisioning({
        workload,
        provisioningAssertionDigest: 'evidence',
        provisioningReference: 'prvref',
      } as never),
    ).resolves.toEqual({ authorized: false });
    await expect(
      adapter.completeProvisioning({
        operationId: ID,
        identityId: new UuidV7(ID),
        authorizationReference: 'wi:1',
      }),
    ).rejects.toThrow('AUTHORIZATION_DENIED');
  });

  it('denies provisioning with no matching durable authority', async () => {
    const { adapter, prisma } = fixture();
    jest.mocked(prisma.provisioningAuthorityRecord.findFirst).mockResolvedValueOnce(null);
    await expect(
      adapter.authorizeProvisioning({
        workload,
        provisioningAssertionDigest: 'evidence',
        provisioningReference: 'bad',
      } as never),
    ).resolves.toEqual({ authorized: false });
  });

  it('fails closed if authority consumption loses its optimistic race', async () => {
    const { adapter, prisma } = fixture();
    jest.mocked(prisma.provisioningAuthorityRecord.updateMany).mockResolvedValueOnce({ count: 0 });
    await expect(
      adapter.completeProvisioning({
        operationId: ID,
        identityId: new UuidV7(TARGET),
        authorizationReference: 'wi:1',
      }),
    ).rejects.toThrow('AUTHORIZATION_DENIED');
  });

  it('authorizes an open bootstrap and denies permanent closure', async () => {
    const { adapter, bootstrap } = fixture();
    await expect(
      adapter.authorizeBootstrap({ workload, bootstrapAssertionDigest: 'evidence' } as never),
    ).resolves.toMatchObject({ available: true, operationId: ID });
    bootstrap.permanentlyClosed = true;
    await expect(
      adapter.authorizeBootstrap({ workload, bootstrapAssertionDigest: 'evidence' } as never),
    ).resolves.toEqual({ available: false });
  });

  it.each([
    { lifecycleState: 'CONSUMED' },
    { operationId: TARGET },
    { evidenceDigest: 'different' },
    { expiresAt: new Date(0) },
  ])('denies bootstrap when any binding or lifecycle control fails', async (override) => {
    const { adapter, bootstrap } = fixture();
    Object.assign(bootstrap, override);
    await expect(
      adapter.authorizeBootstrap({ workload, bootstrapAssertionDigest: 'evidence' } as never),
    ).resolves.toEqual({ available: false });
  });

  it('starts first-Super-Admin bootstrap preparation and records failure states', async () => {
    const { adapter, activation, prisma } = fixture();
    await adapter.completeBootstrapPreparation({
      operationId: ID,
      identityId: new UuidV7(TARGET),
      authorizationReference: 'wi:1',
    });
    expect(activation.begin).toHaveBeenCalledWith(
      expect.objectContaining({ sagaType: 'FIRST_SUPER_ADMIN_BOOTSTRAP' }),
    );
    await adapter.markProvisioningFailure({ operationId: ID, reasonCode: 'FAILED' });
    await adapter.markBootstrapFailure({ operationId: ID, reasonCode: 'FAILED' });
    expect(prisma.bootstrapControlRecord.updateMany).toHaveBeenCalled();
  });

  it('denies bootstrap preparation after permanent closure', async () => {
    const { adapter, bootstrap } = fixture();
    bootstrap.permanentlyClosed = true;
    await expect(
      adapter.completeBootstrapPreparation({
        operationId: ID,
        identityId: new UuidV7(TARGET),
        authorizationReference: 'wi:1',
      }),
    ).rejects.toThrow('BOOTSTRAP_UNAVAILABLE');
  });
});
