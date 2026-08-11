import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { BootstrapAuthorizationPort } from '../ports/bootstrap-authorization.port';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import type { PrivilegedProvisioningAuthorizationPort } from '../ports/privileged-provisioning-authorization.port';
import { PrivilegedProvisioningApplicationService } from './privileged-provisioning-application.service';

const ACTOR_ID = '0191310f-789a-7123-8123-000000000001';
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

function createFixture(
  overrides: {
    provisioningAuthorized?: boolean;
    bootstrapAvailable?: boolean;
    existingSnapshot?: IdentityAuthenticationSnapshot | null;
  } = {},
): {
  service: PrivilegedProvisioningApplicationService;
  identities: jest.Mocked<IdentityRepository>;
  provisioningAuthorization: jest.Mocked<PrivilegedProvisioningAuthorizationPort>;
  bootstrapAuthorization: jest.Mocked<BootstrapAuthorizationPort>;
} {
  const identities: jest.Mocked<IdentityRepository> = {
    findById: jest.fn(),
    findAuthenticationById: jest.fn(),
    findByIdentifierLookups: jest.fn().mockResolvedValue(overrides.existingSnapshot ?? null),
    findPasswordHistory: jest.fn(),
    findRecoveryCodeSets: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn(),
    advanceTotpReplayState: jest.fn(),
  };
  const provisioningAuthorization: jest.Mocked<PrivilegedProvisioningAuthorizationPort> = {
    authorizeProvisioning: jest
      .fn()
      .mockResolvedValue({ authorized: overrides.provisioningAuthorized ?? true }),
  };
  const bootstrapAuthorization: jest.Mocked<BootstrapAuthorizationPort> = {
    authorizeBootstrap: jest
      .fn()
      .mockResolvedValue({ available: overrides.bootstrapAvailable ?? true }),
  };
  const lookups: IdentifierLookupCryptographicPort = {
    createActiveLookup: () => 'lookup-active',
    createLookupsForResolution: () => ['lookup-1', 'lookup-2'],
  };
  const service = new PrivilegedProvisioningApplicationService(
    identities,
    lookups,
    provisioningAuthorization,
    bootstrapAuthorization,
    { now: () => FIXED_NOW },
    { next: () => new UuidV7('0191310f-789a-7123-8123-0000000000aa') },
    { environment: 'test' },
  );
  return { service, identities, provisioningAuthorization, bootstrapAuthorization };
}

function insertOf(
  identities: jest.Mocked<IdentityRepository>,
): Parameters<IdentityRepository['insert']>[0] | undefined {
  return identities.insert.mock.calls[0]?.[0];
}

describe('PrivilegedProvisioningApplicationService.provisionPrivilegedIdentity (M01-ADM-001)', () => {
  it('provisions an Identity with the PRIVILEGED_ADMIN_AUTHENTICATION classification', async () => {
    const { service, identities } = createFixture();

    const result = await service.provisionPrivilegedIdentity({
      actorIdentityId: new UuidV7(ACTOR_ID),
      provisioningReference: 'M02-PROVISIONING-REF-1',
      identifierType: 'EMAIL',
      identifier: 'admin@example.com',
      targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
    });

    expect(result).toEqual({
      operationId: '0191310f-789a-7123-8123-0000000000aa',
      state: 'PENDING_VERIFICATION',
    });
    const changeSet = insertOf(identities);
    expect(changeSet?.identity.properties).toMatchObject({
      identityState: 'PENDING_VERIFICATION',
      verificationState: 'PENDING_VERIFICATION',
    });
    expect(changeSet?.identifiers[0]?.properties).toMatchObject({
      identifierType: 'EMAIL',
      verificationState: 'UNVERIFIED',
      isPrimary: true,
    });
    const assignment = changeSet?.classificationAssignments[0]?.properties;
    expect(assignment).toMatchObject({
      classification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      assignmentState: 'EFFECTIVE',
      sourceContractReference: 'M02-PROVISIONING-REF-1',
      reasonCode: 'PRIVILEGED_PROVISIONING',
    });
    expect(changeSet?.stateTransitionsToAppend[0]?.properties).toMatchObject({
      toState: 'PENDING_VERIFICATION',
      stateVersion: 1,
      sourceReference: 'M02-PROVISIONING-REF-1',
    });
    expect(changeSet?.credentials).toHaveLength(0);
  });

  it('rejects SUPER_ADMIN_AUTHENTICATION to prevent a hidden Super Admin', async () => {
    const { service, identities } = createFixture();

    await expect(
      service.provisionPrivilegedIdentity({
        actorIdentityId: new UuidV7(ACTOR_ID),
        provisioningReference: 'M02-PROVISIONING-REF-2',
        identifierType: 'EMAIL',
        identifier: 'admin@example.com',
        targetAuthenticationSecurityClassification: 'SUPER_ADMIN_AUTHENTICATION',
      }),
    ).rejects.toMatchObject({ code: 'CLASSIFICATION_NOT_PERMITTED' });
    expect(identities.insert.mock.calls).toHaveLength(0);
  });

  it('fails closed with AUTHORIZATION_DENIED when no approved service authorization exists', async () => {
    const { service, identities } = createFixture({ provisioningAuthorized: false });

    await expect(
      service.provisionPrivilegedIdentity({
        actorIdentityId: new UuidV7(ACTOR_ID),
        provisioningReference: 'M02-PROVISIONING-REF-3',
        identifierType: 'EMAIL',
        identifier: 'admin@example.com',
        targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(identities.insert.mock.calls).toHaveLength(0);
  });

  it('passes the provisioning reference to the authorization boundary', async () => {
    const { service, provisioningAuthorization } = createFixture();

    await service.provisionPrivilegedIdentity({
      actorIdentityId: new UuidV7(ACTOR_ID),
      provisioningReference: 'M02-PROVISIONING-REF-4',
      identifierType: 'MOBILE',
      identifier: '+15551234567',
      targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
    });

    expect(provisioningAuthorization.authorizeProvisioning.mock.calls[0]?.[0]).toEqual({
      provisioningReference: 'M02-PROVISIONING-REF-4',
      actorIdentityId: new UuidV7(ACTOR_ID),
    });
  });

  it('rejects an invalid identifier without writing', async () => {
    const { service, identities } = createFixture();

    await expect(
      service.provisionPrivilegedIdentity({
        actorIdentityId: new UuidV7(ACTOR_ID),
        provisioningReference: 'M02-PROVISIONING-REF-5',
        identifierType: 'EMAIL',
        identifier: 'not-an-email',
        targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      }),
    ).rejects.toMatchObject({ code: 'IDENTIFIER_INVALID' });
    expect(identities.insert.mock.calls).toHaveLength(0);
  });

  it('rejects an already registered identifier', async () => {
    const { service, identities } = createFixture({
      existingSnapshot: {
        identity: {} as never,
        identifiers: [],
        credentials: [],
        classificationAssignments: [],
        mfaEnrollments: [],
        mfaFactors: [],
      },
    });

    await expect(
      service.provisionPrivilegedIdentity({
        actorIdentityId: new UuidV7(ACTOR_ID),
        provisioningReference: 'M02-PROVISIONING-REF-6',
        identifierType: 'EMAIL',
        identifier: 'admin@example.com',
        targetAuthenticationSecurityClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
      }),
    ).rejects.toMatchObject({ code: 'IDENTIFIER_ALREADY_REGISTERED' });
    expect(identities.insert.mock.calls).toHaveLength(0);
  });
});

describe('PrivilegedProvisioningApplicationService.bootstrapSuperAdminIdentity (M01-ADM-002)', () => {
  it('bootstraps an Identity with the SUPER_ADMIN_AUTHENTICATION classification', async () => {
    const { service, identities } = createFixture();

    const result = await service.bootstrapSuperAdminIdentity({
      bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-1',
      identifierType: 'EMAIL',
      identifier: 'superadmin@example.com',
    });

    expect(result).toEqual({
      identityId: '0191310f-789a-7123-8123-0000000000aa',
      bootstrapState: 'PENDING_VERIFICATION',
    });
    const changeSet = insertOf(identities);
    expect(changeSet?.identity.properties).toMatchObject({ identityState: 'PENDING_VERIFICATION' });
    const assignment = changeSet?.classificationAssignments[0]?.properties;
    expect(assignment).toMatchObject({
      classification: 'SUPER_ADMIN_AUTHENTICATION',
      assignmentState: 'EFFECTIVE',
      sourceContractReference: 'M01-BOOTSTRAP-EVIDENCE-1',
      reasonCode: 'SUPER_ADMIN_BOOTSTRAP',
    });
    expect(changeSet?.credentials).toHaveLength(0);
  });

  it('fails closed with BOOTSTRAP_UNAVAILABLE when no controlled bootstrap is approved', async () => {
    const { service, identities } = createFixture({ bootstrapAvailable: false });

    await expect(
      service.bootstrapSuperAdminIdentity({
        bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-2',
        identifierType: 'EMAIL',
        identifier: 'superadmin@example.com',
      }),
    ).rejects.toMatchObject({ code: 'BOOTSTRAP_UNAVAILABLE' });
    expect(identities.insert.mock.calls).toHaveLength(0);
  });

  it('passes the bootstrap evidence to the authorization boundary', async () => {
    const { service, bootstrapAuthorization } = createFixture();

    await service.bootstrapSuperAdminIdentity({
      bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-3',
      identifierType: 'MOBILE',
      identifier: '+15551234567',
    });

    expect(bootstrapAuthorization.authorizeBootstrap.mock.calls[0]?.[0]).toEqual({
      bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-3',
    });
  });

  it('rejects an invalid identifier without writing', async () => {
    const { service, identities } = createFixture();

    await expect(
      service.bootstrapSuperAdminIdentity({
        bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-4',
        identifierType: 'EMAIL',
        identifier: 'not-an-email',
      }),
    ).rejects.toMatchObject({ code: 'IDENTIFIER_INVALID' });
    expect(identities.insert.mock.calls).toHaveLength(0);
  });

  it('rejects an already registered identifier', async () => {
    const { service, identities } = createFixture({
      existingSnapshot: {
        identity: {} as never,
        identifiers: [],
        credentials: [],
        classificationAssignments: [],
        mfaEnrollments: [],
        mfaFactors: [],
      },
    });

    await expect(
      service.bootstrapSuperAdminIdentity({
        bootstrapEvidence: 'M01-BOOTSTRAP-EVIDENCE-5',
        identifierType: 'EMAIL',
        identifier: 'superadmin@example.com',
      }),
    ).rejects.toMatchObject({ code: 'IDENTIFIER_ALREADY_REGISTERED' });
  });
});
