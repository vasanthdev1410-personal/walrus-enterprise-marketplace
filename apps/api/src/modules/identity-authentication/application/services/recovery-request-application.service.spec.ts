/* eslint-disable @typescript-eslint/unbound-method */
import { Identity } from '../../domain/identity/entities/identity';
import { IdentityIdentifier } from '../../domain/identity/entities/identity-identifier';
import type {
  IdentityAuthenticationSnapshot,
  IdentityRepository,
} from '../../domain/identity/repositories/identity-repository';
import type { IdentityState } from '../../domain/identity/value-objects/identity-state';
import { RecoveryRequest } from '../../domain/recovery/entities/recovery-request';
import type { RecoveryRequestRepository } from '../../domain/recovery/repositories/recovery-request-repository';
import { PermittedRecoveryOperation } from '../../domain/recovery/value-objects/permitted-recovery-operation';
import { RecoveryPolicyVersion } from '../../domain/recovery/value-objects/recovery-policy-version';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import { RecoveryRequestApplicationService } from './recovery-request-application.service';

const IDENTITY_ID = '0191310f-789a-7123-8123-000000000001';
const RECOVERY_REQUEST_ID = '0191310f-789a-7123-8123-000000000002';
const CONCEALED_ID = '0191310f-789a-7123-8123-000000000099';
const FIXED_NOW = new Date('2026-08-10T12:00:00.000Z');
const VERIFIED_DESTINATION = 'user@example.com';
const IDEMPOTENCY_KEY = 'recovery-key-1234567890abcdef';

const UUID_QUEUE: string[] = [];

function nextUuid(): UuidV7 {
  const value = UUID_QUEUE.shift() ?? CONCEALED_ID;
  return new UuidV7(value);
}

function buildSnapshot(
  identityState: IdentityState = 'ACTIVE',
  verificationState: 'PENDING_VERIFICATION' | 'VERIFIED' = 'VERIFIED',
): IdentityAuthenticationSnapshot {
  return {
    identity: new Identity({
      identityId: new UuidV7(IDENTITY_ID),
      identityState,
      verificationState,
      aggregateVersion: new AggregateVersion(2),
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    }),
    identifiers: [
      new IdentityIdentifier({
        identifierId: new UuidV7('0191310f-789a-7123-8123-000000000010'),
        identityId: new UuidV7(IDENTITY_ID),
        identifierType: 'EMAIL',
        protectedNormalizedValue: new ProtectedValue(VERIFIED_DESTINATION),
        lookupDigest: new ProtectedValue('lookup:v2:digest'),
        lookupKeyVersion: 'v1',
        verificationState: 'VERIFIED',
        isPrimary: true,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        verifiedAt: FIXED_NOW,
      }),
    ],
    credentials: [],
    classificationAssignments: [],
    mfaEnrollments: [],
    mfaFactors: [],
  };
}

interface RecoveryRequestFixture {
  readonly service: RecoveryRequestApplicationService;
  readonly identityRepository: jest.Mocked<IdentityRepository>;
  readonly recoveryRequests: jest.Mocked<RecoveryRequestRepository>;
}

function createFixture(): RecoveryRequestFixture {
  const identityRepository: jest.Mocked<IdentityRepository> = {
    findById: jest.fn(),
    findAuthenticationById: jest.fn(),
    findByIdentifierLookups: jest.fn(),
    findPasswordHistory: jest.fn(),
    findRecoveryCodeSets: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
    advanceTotpReplayState: jest.fn(),
  };
  const recoveryRequests: jest.Mocked<RecoveryRequestRepository> = {
    findById: jest.fn(),
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const identifierLookup: jest.Mocked<IdentifierLookupCryptographicPort> = {
    createActiveLookup: jest.fn(),
    createLookupsForResolution: jest.fn().mockReturnValue(['lookup:v2:digest']),
  };
  const clock = { now: jest.fn().mockReturnValue(FIXED_NOW) };
  const identifiers = { next: nextUuid };
  const service = new RecoveryRequestApplicationService(
    identityRepository,
    recoveryRequests,
    identifierLookup,
    clock,
    identifiers,
    {
      environment: 'test',
      recoveryPolicyVersion: 'v1',
      requestLifetimeSeconds: 3600,
    },
  );
  return { service, identityRepository, recoveryRequests };
}

function buildRecoveryRequest(
  overrides: Partial<RecoveryRequest['properties']> = {},
): RecoveryRequest {
  const now = FIXED_NOW;
  return new RecoveryRequest({
    recoveryRequestId: new UuidV7(RECOVERY_REQUEST_ID),
    identityId: new UuidV7(IDENTITY_ID),
    operationClass: 'PASSWORD_RESET',
    recoveryState: 'REQUESTED',
    recoveryAssurance: 'RA0',
    recoveryPolicyVersion: new RecoveryPolicyVersion('v1'),
    permittedOperation: new PermittedRecoveryOperation('PASSWORD_RESET'),
    stateVersion: 1,
    expiresAt: new Date(now.getTime() + 3_600_000),
    aggregateVersion: new AggregateVersion(1),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('RecoveryRequestApplicationService (M01-REC-001)', () => {
  beforeEach(() => {
    UUID_QUEUE.length = 0;
  });

  it('creates a REQUESTED/RA0 recovery request for an eligible identity', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findByIdentifierLookups.mockResolvedValue(buildSnapshot());
    UUID_QUEUE.push(RECOVERY_REQUEST_ID);

    const result = await service.startRecovery({
      operationClass: 'PASSWORD_RESET',
      recoveryLocatorType: 'EMAIL',
      recoveryLocator: VERIFIED_DESTINATION,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toEqual({
      accepted: true,
      recoveryRequestLocator: RECOVERY_REQUEST_ID,
      nextAction: 'SUBMIT_EVIDENCE',
    });
    const changeSet = recoveryRequests.insert.mock.calls[0]?.[0];
    expect(changeSet?.recoveryRequest.properties).toMatchObject({
      recoveryRequestId: new UuidV7(RECOVERY_REQUEST_ID),
      identityId: new UuidV7(IDENTITY_ID),
      operationClass: 'PASSWORD_RESET',
      recoveryState: 'REQUESTED',
      recoveryAssurance: 'RA0',
      recoveryPolicyVersion: { value: 'v1' },
      permittedOperation: { value: 'PASSWORD_RESET' },
      stateVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(changeSet?.evidence).toEqual([]);
    expect(changeSet?.notifications).toEqual([]);
    expect(changeSet?.approvalsToAppend).toEqual([]);
    expect(changeSet?.attemptsToAppend).toEqual([]);
    expect(changeSet?.transitionsToAppend).toEqual([]);
    expect(
      changeSet?.recoveryRequest.properties.expiresAt.getTime(),
    ).toBe(FIXED_NOW.getTime() + 3_600_000);
  });

  it('persists the correlation id when supplied', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findByIdentifierLookups.mockResolvedValue(buildSnapshot());
    UUID_QUEUE.push(RECOVERY_REQUEST_ID);

    await service.startRecovery({
      operationClass: 'MFA_FACTOR_REPLACEMENT',
      recoveryLocatorType: 'EMAIL',
      recoveryLocator: VERIFIED_DESTINATION,
      idempotencyKey: IDEMPOTENCY_KEY,
      correlationId: '0191310f-789a-7123-8123-000000000050',
    });

    const changeSet = recoveryRequests.insert.mock.calls[0]?.[0];
    expect(changeSet?.recoveryRequest.properties.correlationId?.value).toBe(
      '0191310f-789a-7123-8123-000000000050',
    );
  });

  it('returns a concealed locator without persisting when the identity is missing', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findByIdentifierLookups.mockResolvedValue(null);
    UUID_QUEUE.push(CONCEALED_ID);

    const result = await service.startRecovery({
      operationClass: 'PASSWORD_RESET',
      recoveryLocatorType: 'EMAIL',
      recoveryLocator: VERIFIED_DESTINATION,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toEqual({
      accepted: true,
      recoveryRequestLocator: CONCEALED_ID,
      nextAction: 'SUBMIT_EVIDENCE',
    });
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('returns a concealed locator without persisting for an unverified identity', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findByIdentifierLookups.mockResolvedValue(
      buildSnapshot('ACTIVE', 'PENDING_VERIFICATION'),
    );
    UUID_QUEUE.push(CONCEALED_ID);

    const result = await service.startRecovery({
      operationClass: 'PASSWORD_RESET',
      recoveryLocatorType: 'EMAIL',
      recoveryLocator: VERIFIED_DESTINATION,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result.accepted).toBe(true);
    expect(result.recoveryRequestLocator).toBe(CONCEALED_ID);
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('returns a concealed locator without persisting for a deleted identity', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findByIdentifierLookups.mockResolvedValue(buildSnapshot('DELETED'));
    UUID_QUEUE.push(CONCEALED_ID);

    const result = await service.startRecovery({
      operationClass: 'PASSWORD_RESET',
      recoveryLocatorType: 'EMAIL',
      recoveryLocator: VERIFIED_DESTINATION,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result.accepted).toBe(true);
    expect(result.recoveryRequestLocator).toBe(CONCEALED_ID);
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('returns a concealed locator without persisting for an invalid locator', async () => {
    const { service, recoveryRequests } = createFixture();
    UUID_QUEUE.push(CONCEALED_ID);

    const result = await service.startRecovery({
      operationClass: 'PASSWORD_RESET',
      recoveryLocatorType: 'EMAIL',
      recoveryLocator: 'not-an-email',
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result.accepted).toBe(true);
    expect(result.recoveryRequestLocator).toBe(CONCEALED_ID);
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('returns a concealed locator when the claimed locator type is not verified', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    // The identity is verified overall but only on MOBILE; the EMAIL locator
    // claimed by the caller is unverified and must not receive a request.
    const snapshot: IdentityAuthenticationSnapshot = {
      ...buildSnapshot('ACTIVE', 'VERIFIED'),
      identifiers: [
        new IdentityIdentifier({
          identifierId: new UuidV7('0191310f-789a-7123-8123-000000000011'),
          identityId: new UuidV7(IDENTITY_ID),
          identifierType: 'MOBILE',
          protectedNormalizedValue: new ProtectedValue('+15551234567'),
          lookupDigest: new ProtectedValue('lookup:v2:mobile-digest'),
          lookupKeyVersion: 'v1',
          verificationState: 'VERIFIED',
          isPrimary: true,
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
          verifiedAt: FIXED_NOW,
        }),
        new IdentityIdentifier({
          identifierId: new UuidV7('0191310f-789a-7123-8123-000000000012'),
          identityId: new UuidV7(IDENTITY_ID),
          identifierType: 'EMAIL',
          protectedNormalizedValue: new ProtectedValue(VERIFIED_DESTINATION),
          lookupDigest: new ProtectedValue('lookup:v2:digest'),
          lookupKeyVersion: 'v1',
          verificationState: 'UNVERIFIED',
          isPrimary: false,
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
        }),
      ],
    };
    identityRepository.findByIdentifierLookups.mockResolvedValue(snapshot);
    UUID_QUEUE.push(CONCEALED_ID);

    const result = await service.startRecovery({
      operationClass: 'PASSWORD_RESET',
      recoveryLocatorType: 'EMAIL',
      recoveryLocator: VERIFIED_DESTINATION,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result.accepted).toBe(true);
    expect(result.recoveryRequestLocator).toBe(CONCEALED_ID);
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });
});

describe('RecoveryRequestApplicationService.getStatus (M01-REC-003)', () => {
  beforeEach(() => {
    UUID_QUEUE.length = 0;
  });

  it('returns the safe status of a REQUESTED recovery request', async () => {
    const { service, recoveryRequests } = createFixture();
    recoveryRequests.findById.mockResolvedValue(buildRecoveryRequest());

    const result = await service.getStatus(new UuidV7(RECOVERY_REQUEST_ID));

    expect(result).toEqual({
      recoveryRequestId: RECOVERY_REQUEST_ID,
      safeState: 'REQUESTED',
      nextAction: 'SUBMIT_EVIDENCE',
      expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000).toISOString(),
      version: 1,
    });
    expect(recoveryRequests.findById).toHaveBeenCalledWith(new UuidV7(RECOVERY_REQUEST_ID));
  });

  it('reports an effective EXPIRED state when the request is past expiry without mutating', async () => {
    const { service, recoveryRequests } = createFixture();
    // The request itself was created an hour ago with a 1h lifetime that has
    // since elapsed; the entity requires expiresAt > createdAt, so both move
    // into the past together.
    recoveryRequests.findById.mockResolvedValue(
      buildRecoveryRequest({
        createdAt: new Date(FIXED_NOW.getTime() - 7_200_000),
        updatedAt: new Date(FIXED_NOW.getTime() - 7_200_000),
        expiresAt: new Date(FIXED_NOW.getTime() - 3_600_000),
      }),
    );

    const result = await service.getStatus(new UuidV7(RECOVERY_REQUEST_ID));

    expect(result.safeState).toBe('EXPIRED');
    expect(result.nextAction).toBe('NONE');
    expect(result.expiresAt).toBeUndefined();
    expect(recoveryRequests.save).not.toHaveBeenCalled();
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('keeps a terminal stored state as-is', async () => {
    const { service, recoveryRequests } = createFixture();
    recoveryRequests.findById.mockResolvedValue(
      buildRecoveryRequest({ recoveryState: 'COMPLETED' }),
    );

    const result = await service.getStatus(new UuidV7(RECOVERY_REQUEST_ID));

    expect(result.safeState).toBe('COMPLETED');
    expect(result.nextAction).toBe('NONE');
    expect(result.expiresAt).toBeUndefined();
  });

  it('throws RESOURCE_NOT_AVAILABLE for an unknown locator', async () => {
    const { service, recoveryRequests } = createFixture();
    recoveryRequests.findById.mockResolvedValue(null);

    await expect(service.getStatus(new UuidV7(CONCEALED_ID))).rejects.toMatchObject({
      code: 'RESOURCE_NOT_AVAILABLE',
    });
  });
});
