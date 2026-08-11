/* eslint-disable @typescript-eslint/unbound-method */
import { Identity } from '../../domain/identity/entities/identity';
import { IdentityIdentifier } from '../../domain/identity/entities/identity-identifier';
import { MfaEnrollment } from '../../domain/identity/entities/mfa-enrollment';
import { MfaFactor } from '../../domain/identity/entities/mfa-factor';
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
import { MfaReplacementApplicationService } from './mfa-replacement-application.service';

const IDENTITY_ID = '0191310f-789a-7123-8123-000000000001';
const RECOVERY_REQUEST_ID = '0191310f-789a-7123-8123-000000000002';
const ENROLLMENT_ID = '0191310f-789a-7123-8123-000000000003';
const FACTOR_ID = '0191310f-789a-7123-8123-000000000004';
const EXISTING_REQUEST_ID = '0191310f-789a-7123-8123-000000000005';
const FIXED_NOW = new Date('2026-08-10T12:00:00.000Z');

const UUID_QUEUE: string[] = [];

function nextUuid(): UuidV7 {
  const value = UUID_QUEUE.shift() ?? RECOVERY_REQUEST_ID;
  return new UuidV7(value);
}

function buildEnrolledSnapshot(
  identityState: IdentityState = 'ACTIVE',
  verificationState: 'PENDING_VERIFICATION' | 'VERIFIED' = 'VERIFIED',
  factorState: 'ACTIVE' | 'REPLACEMENT_REQUIRED' | 'REVOKED' = 'ACTIVE',
): IdentityAuthenticationSnapshot {
  const enrollment = new MfaEnrollment({
    mfaEnrollmentId: new UuidV7(ENROLLMENT_ID),
    identityId: new UuidV7(IDENTITY_ID),
    enrollmentState:
      factorState === 'ACTIVE'
        ? 'ACTIVE'
        : factorState === 'REVOKED'
          ? 'DISABLED'
          : 'REPLACEMENT_REQUIRED',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...(factorState === 'ACTIVE' ? { activatedAt: FIXED_NOW } : {}),
  });
  const factor = new MfaFactor({
    mfaFactorId: new UuidV7(FACTOR_ID),
    mfaEnrollmentId: new UuidV7(ENROLLMENT_ID),
    factorType: 'TOTP_AUTHENTICATOR',
    factorState,
    encryptedSecretOrReference: new ProtectedValue('envelope:encrypted-secret'),
    encryptionKeyVersion: 'v1',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...(factorState === 'ACTIVE' ? { verifiedAt: FIXED_NOW } : {}),
    ...(factorState === 'REVOKED' ? { revokedAt: FIXED_NOW } : {}),
  });
  return {
    identity: new Identity({
      identityId: new UuidV7(IDENTITY_ID),
      identityState,
      verificationState,
      aggregateVersion: new AggregateVersion(4),
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    }),
    identifiers: [
      new IdentityIdentifier({
        identifierId: new UuidV7('0191310f-789a-7123-8123-000000000010'),
        identityId: new UuidV7(IDENTITY_ID),
        identifierType: 'EMAIL',
        protectedNormalizedValue: new ProtectedValue('user@example.com'),
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
    mfaEnrollments: [enrollment],
    mfaFactors: [factor],
  };
}

interface MfaReplacementFixture {
  readonly service: MfaReplacementApplicationService;
  readonly identityRepository: jest.Mocked<IdentityRepository>;
  readonly recoveryRequests: jest.Mocked<RecoveryRequestRepository>;
}

function createFixture(): MfaReplacementFixture {
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
    findActiveByOperationClass: jest.fn().mockResolvedValue(null),
    findEvidence: jest.fn().mockResolvedValue([]),
    findApprovalRecords: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    submitRecoveryCodeEvidence: jest.fn().mockResolvedValue(undefined),
    recordApprovalDecision: jest.fn().mockResolvedValue(undefined),
    executeRecovery: jest.fn().mockResolvedValue(undefined),
  };
  const clock = { now: jest.fn().mockReturnValue(FIXED_NOW) };
  const identifiers = { next: nextUuid };
  const service = new MfaReplacementApplicationService(
    identityRepository,
    recoveryRequests,
    clock,
    identifiers,
    {
      recoveryPolicyVersion: 'v1',
      requestLifetimeSeconds: 3600,
    },
  );
  return { service, identityRepository, recoveryRequests };
}

describe('MfaReplacementApplicationService.requestReplacement (M01-MFA-004)', () => {
  beforeEach(() => {
    UUID_QUEUE.length = 0;
  });

  const command = {
    identityId: new UuidV7(IDENTITY_ID),
    expectedIdentityVersion: 4,
    replacementFactorType: 'TOTP_AUTHENTICATOR',
  };

  it('creates a REQUESTED/RA0 recovery request bound to MFA_FACTOR_REPLACEMENT', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findAuthenticationById.mockResolvedValue(buildEnrolledSnapshot());
    UUID_QUEUE.push(RECOVERY_REQUEST_ID);

    const result = await service.requestReplacement(command);

    expect(result).toEqual({
      requestId: RECOVERY_REQUEST_ID,
      state: 'REQUESTED',
      nextAction: 'SUBMIT_EVIDENCE',
      version: 1,
    });
    expect(recoveryRequests.findActiveByOperationClass).toHaveBeenCalledWith(
      new UuidV7(IDENTITY_ID),
      'MFA_FACTOR_REPLACEMENT',
      FIXED_NOW,
    );
    const changeSet = recoveryRequests.insert.mock.calls[0]?.[0];
    expect(changeSet?.recoveryRequest.properties).toMatchObject({
      recoveryRequestId: new UuidV7(RECOVERY_REQUEST_ID),
      identityId: new UuidV7(IDENTITY_ID),
      operationClass: 'MFA_FACTOR_REPLACEMENT',
      recoveryState: 'REQUESTED',
      recoveryAssurance: 'RA0',
      recoveryPolicyVersion: { value: 'v1' },
      permittedOperation: { value: 'MFA_FACTOR_REPLACEMENT' },
      stateVersion: 1,
      aggregateVersion: { value: 1 },
    });
    expect(changeSet?.evidence).toEqual([]);
    expect(changeSet?.notifications).toEqual([]);
    expect(changeSet?.approvalsToAppend).toEqual([]);
    expect(changeSet?.attemptsToAppend).toEqual([]);
    expect(changeSet?.transitionsToAppend).toEqual([]);
    expect(changeSet?.recoveryRequest.properties.expiresAt.getTime()).toBe(
      FIXED_NOW.getTime() + 3_600_000,
    );
  });

  it('rejects an unsupported replacement factor type without persisting', async () => {
    const { service, recoveryRequests } = createFixture();

    await expect(
      service.requestReplacement({ ...command, replacementFactorType: 'WEBAUTHN_PASSKEY' }),
    ).rejects.toMatchObject({ code: 'MFA_ENROLLMENT_NOT_PERMITTED' });
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('rejects an identity that is not ACTIVE', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findAuthenticationById.mockResolvedValue(buildEnrolledSnapshot('LOCKED'));

    await expect(service.requestReplacement(command)).rejects.toMatchObject({
      code: 'MFA_ENROLLMENT_NOT_PERMITTED',
    });
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('rejects an unverified identity', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findAuthenticationById.mockResolvedValue(
      buildEnrolledSnapshot('ACTIVE', 'PENDING_VERIFICATION'),
    );

    await expect(service.requestReplacement(command)).rejects.toMatchObject({
      code: 'MFA_ENROLLMENT_NOT_PERMITTED',
    });
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('rejects a stale identity version precondition', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findAuthenticationById.mockResolvedValue(buildEnrolledSnapshot());

    await expect(
      service.requestReplacement({ ...command, expectedIdentityVersion: 3 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('rejects a request when no replaceable factor of the requested type exists', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    // The enrolled factor is already REVOKED: nothing can be replaced.
    identityRepository.findAuthenticationById.mockResolvedValue(
      buildEnrolledSnapshot('ACTIVE', 'VERIFIED', 'REVOKED'),
    );

    await expect(service.requestReplacement(command)).rejects.toMatchObject({
      code: 'MFA_ENROLLMENT_NOT_PERMITTED',
    });
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('rejects a request when a replacement is already in flight', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findAuthenticationById.mockResolvedValue(buildEnrolledSnapshot());
    recoveryRequests.findActiveByOperationClass.mockResolvedValue(
      new RecoveryRequest({
        recoveryRequestId: new UuidV7(EXISTING_REQUEST_ID),
        identityId: new UuidV7(IDENTITY_ID),
        operationClass: 'MFA_FACTOR_REPLACEMENT',
        recoveryState: 'EVIDENCE_PENDING',
        recoveryAssurance: 'RA0',
        recoveryPolicyVersion: new RecoveryPolicyVersion('v1'),
        permittedOperation: new PermittedRecoveryOperation('MFA_FACTOR_REPLACEMENT'),
        stateVersion: 2,
        expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000),
        aggregateVersion: new AggregateVersion(2),
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      }),
    );

    await expect(service.requestReplacement(command)).rejects.toMatchObject({
      code: 'RESOURCE_STATE_CONFLICT',
    });
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });

  it('fails closed when the identity snapshot is unavailable', async () => {
    const { service, identityRepository, recoveryRequests } = createFixture();
    identityRepository.findAuthenticationById.mockResolvedValue(null);

    await expect(service.requestReplacement(command)).rejects.toMatchObject({
      code: 'MFA_ENROLLMENT_NOT_PERMITTED',
    });
    expect(recoveryRequests.insert).not.toHaveBeenCalled();
  });
});
