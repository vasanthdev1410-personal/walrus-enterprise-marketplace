import type {
  IdentityRepository,
  IdentityAuthenticationSnapshot,
} from '../../domain/identity/repositories/identity-repository';
import type { SessionRepository } from '../../domain/session/repositories/session-repository';
import type { IdentityState } from '../../domain/identity/value-objects/identity-state';
import { OptimisticConcurrencyError } from '../../domain/shared/errors/optimistic-concurrency.error';
import { AggregateVersion } from '../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';
import { Credential } from '../../domain/identity/entities/credential';
import { Identity } from '../../domain/identity/entities/identity';
import { PasswordHistoryRecord } from '../../domain/identity/entities/password-history-record';
import type { PasswordHashingPort } from '../ports/password-hashing.port';
import type { IdentifierLookupCryptographicPort } from '../ports/identifier-lookup-cryptographic.port';
import { IdentityError } from '../errors/identity.error';
import { IdentityManagementApplicationService } from './identity-management-application.service';

const IDENTITY_ID = '0191310f-789a-7123-8123-000000000001';
const SESSION_ID = '0191310f-789a-7123-8123-000000000002';
const FIXED_NOW = new Date('2026-08-06T12:00:00.000Z');

function buildSnapshot(identityState: IdentityState = 'ACTIVE'): IdentityAuthenticationSnapshot {
  return {
    identity: new Identity({
      identityId: new UuidV7(IDENTITY_ID),
      identityState,
      verificationState: 'VERIFIED',
      aggregateVersion: new AggregateVersion(2),
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    }),
    identifiers: [],
    credentials: [],
    classificationAssignments: [],
    mfaEnrollments: [],
    mfaFactors: [],
  };
}

describe('IdentityManagementApplicationService', () => {
  const mockIdentityRepo: jest.Mocked<IdentityRepository> = {
    findById: jest.fn(),
    findAuthenticationById: jest.fn(),
    findByIdentifierLookups: jest.fn(),
    findPasswordHistory: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
    advanceTotpReplayState: jest.fn(),
  };

  const mockSessionRepo: jest.Mocked<SessionRepository> = {
    findById: jest.fn(),
    findByRefreshTokenDigest: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeRefreshTokenFamilyForReuse: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllSessions: jest.fn(),
    revokeAllSessionsForRecovery: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
  };

  const mockPasswordHashing: jest.Mocked<PasswordHashingPort> = {
    hash: jest.fn().mockResolvedValue('hashed_password_123'),
    verify: jest.fn(),
    verifyForAuthentication: jest.fn(),
    needsRehash: jest.fn(),
  };

  const mockIdentifierLookup: jest.Mocked<IdentifierLookupCryptographicPort> = {
    createActiveLookup: jest.fn().mockReturnValue('digest_abc_123'),
    createLookupsForResolution: jest.fn().mockReturnValue(['digest_abc_123']),
  };

  const mockClock = { now: () => FIXED_NOW };
  const mockIdentifiers = {
    next: jest
      .fn()
      .mockReturnValueOnce(new UuidV7('0191310f-789a-7123-8123-000000000001'))
      .mockReturnValueOnce(new UuidV7('0191310f-789a-7123-8123-000000000002'))
      .mockReturnValueOnce(new UuidV7('0191310f-789a-7123-8123-000000000003'))
      .mockReturnValueOnce(new UuidV7('0191310f-789a-7123-8123-000000000004'))
      .mockReturnValueOnce(new UuidV7('0191310f-789a-7123-8123-000000000005'))
      .mockReturnValue(new UuidV7('0191310f-789a-7123-8123-000000000099')),
  };

  let service: IdentityManagementApplicationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IdentityManagementApplicationService(
      mockIdentityRepo,
      mockSessionRepo,
      mockPasswordHashing,
      mockIdentifierLookup,
      mockClock,
      mockIdentifiers,
      {
        environment: 'test',
        minimumPasswordLength: 8,
        maximumPasswordLength: 1024,
        passwordHistoryDepth: 5,
      },
    );
  });

  describe('M01-ID-001 Registration', () => {
    it('registers a new identity successfully', async () => {
      mockIdentityRepo.findByIdentifierLookups.mockResolvedValue(null);
      mockIdentityRepo.insert.mockResolvedValue(undefined);

      const result = await service.register({
        identifierType: 'EMAIL',
        identifier: 'user@example.com',
        password: 'SecurePassword123!',
      });

      expect(result.identityId).toBe('0191310f-789a-7123-8123-000000000001');
      expect(result.identityState).toBe('PENDING_VERIFICATION');
      expect(result.verificationState).toBe('PENDING_VERIFICATION');
      expect(mockIdentityRepo.insert.mock.calls).toHaveLength(1);
      expect(mockIdentityRepo.insert.mock.calls[0]?.[0].identifiers).toHaveLength(1);
      expect(mockIdentityRepo.insert.mock.calls[0]?.[0].stateTransitionsToAppend).toHaveLength(1);
    });

    it('throws error if identifier is already registered', async () => {
      mockIdentityRepo.findByIdentifierLookups.mockResolvedValue(buildSnapshot());

      await expect(
        service.register({
          identifierType: 'EMAIL',
          identifier: 'existing@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(IdentityError);
    });

    it('rejects a self-asserted privileged classification', async () => {
      await expect(
        service.register({
          identifierType: 'EMAIL',
          identifier: 'user@example.com',
          password: 'Password123!',
          classification: 'SUPER_ADMIN_AUTHENTICATION',
        }),
      ).rejects.toMatchObject({ code: 'CLASSIFICATION_NOT_PERMITTED' });
      expect(mockIdentityRepo.insert.mock.calls).toHaveLength(0);
    });

    it('maps a malformed identifier to IDENTIFIER_INVALID instead of a raw 500', async () => {
      await expect(
        service.register({
          identifierType: 'EMAIL',
          identifier: 'not-an-email',
          password: 'Password123!',
        }),
      ).rejects.toMatchObject({ code: 'IDENTIFIER_INVALID' });
    });

    it('maps a concurrent duplicate insert (unique constraint) to IDENTIFIER_ALREADY_REGISTERED', async () => {
      mockIdentityRepo.findByIdentifierLookups.mockResolvedValue(null);
      mockIdentityRepo.insert.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['identifierType', 'lookupDigest'] },
      });

      await expect(
        service.register({
          identifierType: 'EMAIL',
          identifier: 'user@example.com',
          password: 'Password123!',
        }),
      ).rejects.toMatchObject({ code: 'IDENTIFIER_ALREADY_REGISTERED' });
    });
  });

  describe('M01-ID-002 Profile Retrieval', () => {
    it('returns the current profile for an existing identity', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(buildSnapshot('ACTIVE'));

      const result = await service.getProfile(new UuidV7(IDENTITY_ID));

      expect(result.identityId).toBe(IDENTITY_ID);
      expect(result.identityState).toBe('ACTIVE');
      expect(result.aggregateVersion).toBe(2);
    });

    it('throws if identity is not found', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(null);

      await expect(
        service.getProfile(new UuidV7('0191310f-789a-7123-8123-000000000001')),
      ).rejects.toThrow(IdentityError);
    });
  });

  describe('M01-ID-003 Profile Update (minimal contract)', () => {
    it('advances the aggregate version and updatedAt without a state transition', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(buildSnapshot('ACTIVE'));
      mockIdentityRepo.save.mockResolvedValue(undefined);

      const result = await service.updateProfile(new UuidV7(IDENTITY_ID));

      expect(result.identityState).toBe('ACTIVE');
      expect(result.aggregateVersion).toBe(3);
      expect(result.updatedAt).toEqual(FIXED_NOW);
      expect(mockIdentityRepo.save.mock.calls).toHaveLength(1);
      const changeSet = mockIdentityRepo.save.mock.calls[0]?.[0];
      expect(changeSet?.stateTransitionsToAppend).toHaveLength(0);
      expect(mockIdentityRepo.save.mock.calls[0]?.[1].value).toBe(2);
    });

    it('throws if identity is not found', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(null);

      await expect(service.updateProfile(new UuidV7(IDENTITY_ID))).rejects.toThrow(IdentityError);
    });
  });

  describe('M01-ID-004 Deactivation', () => {
    it('deactivates active identity and revokes every session', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(buildSnapshot('ACTIVE'));
      mockIdentityRepo.save.mockResolvedValue(undefined);
      mockSessionRepo.revokeAllSessions.mockResolvedValue(1);

      const result = await service.deactivate(new UuidV7(IDENTITY_ID), {
        reasonCode: 'USER_REQUESTED',
        authorizingSessionId: new UuidV7(SESSION_ID),
        expectedAuthorizingSessionVersion: 1,
      });

      expect(result.identityState).toBe('DISABLED');
      expect(result.disabledAt).toEqual(FIXED_NOW);
      expect(mockIdentityRepo.save.mock.calls).toHaveLength(1);
      const revocation = mockSessionRepo.revokeAllSessions.mock.calls[0]?.[0];
      expect(revocation?.identityId).toBeInstanceOf(UuidV7);
      expect(revocation).toMatchObject({
        expectedAuthorizingSessionVersion: 1,
        revocationReason: 'USER_REQUESTED',
      });
    });

    it('skips session revocation when no authorizing session is supplied', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(buildSnapshot('ACTIVE'));
      mockIdentityRepo.save.mockResolvedValue(undefined);

      const result = await service.deactivate(new UuidV7(IDENTITY_ID));

      expect(result.identityState).toBe('DISABLED');
      expect(mockSessionRepo.revokeAllSessions.mock.calls).toHaveLength(0);
    });

    it('rejects an already deactivated identity', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(buildSnapshot('DISABLED'));

      await expect(
        service.deactivate(new UuidV7(IDENTITY_ID), {
          authorizingSessionId: new UuidV7(SESSION_ID),
          expectedAuthorizingSessionVersion: 1,
        }),
      ).rejects.toThrow(IdentityError);
    });
  });

  describe('M01-ID-005 Soft Deletion', () => {
    it('stages identity for deletion and revokes every session', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(buildSnapshot('ACTIVE'));
      mockIdentityRepo.save.mockResolvedValue(undefined);
      mockSessionRepo.revokeAllSessions.mockResolvedValue(1);

      const result = await service.softDelete(new UuidV7(IDENTITY_ID), {
        authorizingSessionId: new UuidV7(SESSION_ID),
        expectedAuthorizingSessionVersion: 1,
      });

      expect(result.identityState).toBe('DELETED');
      expect(result.deletionRequestedAt).toEqual(FIXED_NOW);
      expect(mockIdentityRepo.save.mock.calls).toHaveLength(1);
      const revocation = mockSessionRepo.revokeAllSessions.mock.calls[0]?.[0];
      expect(revocation).toMatchObject({
        revocationReason: 'IDENTITY_DELETION_REQUESTED',
      });
    });

    it('rejects an identity already pending deletion', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(buildSnapshot('DELETED'));

      await expect(service.softDelete(new UuidV7(IDENTITY_ID))).rejects.toThrow(IdentityError);
    });
  });

  describe('M01-CRED-001 Password Change', () => {
    const CREDENTIAL_ID = '0191310f-789a-7123-8123-000000000010';
    const command = {
      currentPassword: 'CurrentPass1!',
      newPassword: 'NewPass123!',
      expectedIdentityVersion: 2,
      authorizingSessionId: new UuidV7(SESSION_ID),
      expectedAuthorizingSessionVersion: 1,
    };

    function buildCredentialSnapshot(
      passwordHash = 'current-hash',
      identityState: IdentityState = 'ACTIVE',
    ): IdentityAuthenticationSnapshot {
      return {
        ...buildSnapshot(identityState),
        credentials: [
          new Credential({
            credentialId: new UuidV7(CREDENTIAL_ID),
            identityId: new UuidV7(IDENTITY_ID),
            credentialType: 'PASSWORD',
            credentialVersion: 1,
            credentialState: 'ACTIVE',
            protectedSecret: new ProtectedValue(passwordHash),
            protectionKeyVersion: 'v1',
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
          }),
        ],
      };
    }

    beforeEach(() => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(buildCredentialSnapshot());
      mockIdentityRepo.findPasswordHistory.mockResolvedValue([]);
      mockPasswordHashing.verifyForAuthentication.mockResolvedValue(true);
      mockPasswordHashing.verify.mockResolvedValue(false);
      mockPasswordHashing.hash.mockResolvedValue('new-hash');
      mockSessionRepo.revokeAllSessions.mockResolvedValue(1);
    });

    it('replaces the active credential, appends history and revokes every session', async () => {
      await service.changePassword(new UuidV7(IDENTITY_ID), command);

      const changeSet = mockIdentityRepo.save.mock.calls[0]?.[0];
      expect(mockIdentityRepo.save.mock.calls).toHaveLength(1);
      expect(mockIdentityRepo.save.mock.calls[0]?.[1].value).toBe(2);
      expect(changeSet?.identity.properties.aggregateVersion.value).toBe(3);
      expect(changeSet?.credentials).toHaveLength(2);
      const replaced = changeSet?.credentials.find(
        (credential) => credential.properties.credentialState === 'REPLACED',
      );
      expect(replaced?.properties.replacedAt).toEqual(FIXED_NOW);
      const issued = changeSet?.credentials.find(
        (credential) => credential.properties.credentialState === 'ACTIVE',
      );
      expect(issued?.properties.credentialVersion).toBe(2);
      expect(issued?.properties.protectedSecret.value).toBe('new-hash');
      expect(changeSet?.credentialHistoryToAppend[0]?.properties.eventType).toBe('REPLACED');
      expect(changeSet?.credentialHistoryToAppend[0]?.properties.sourceCredentialId?.value).toBe(
        CREDENTIAL_ID,
      );
      expect(changeSet?.passwordHistoryToAppend[0]?.properties.passwordHash.value).toBe(
        'current-hash',
      );
      const revocation = mockSessionRepo.revokeAllSessions.mock.calls[0]?.[0];
      expect(revocation).toMatchObject({
        identityId: { value: IDENTITY_ID },
        authorizingSessionId: { value: SESSION_ID },
        expectedAuthorizingSessionVersion: 1,
        revocationReason: 'PASSWORD_CHANGED',
      });
    });

    it('rejects an incorrect current password without persisting anything', async () => {
      mockPasswordHashing.verifyForAuthentication.mockResolvedValue(false);

      await expect(service.changePassword(new UuidV7(IDENTITY_ID), command)).rejects.toMatchObject({
        code: 'CURRENT_CREDENTIAL_INVALID',
      });
      expect(mockIdentityRepo.save.mock.calls).toHaveLength(0);
      expect(mockSessionRepo.revokeAllSessions.mock.calls).toHaveLength(0);
    });

    it('rejects a new password identical to the current password', async () => {
      await expect(
        service.changePassword(new UuidV7(IDENTITY_ID), {
          ...command,
          newPassword: 'CurrentPass1!',
        }),
      ).rejects.toMatchObject({ code: 'PASSWORD_POLICY_FAILED' });
      expect(mockPasswordHashing.hash.mock.calls).toHaveLength(0);
    });

    it('rejects a new password outside the policy length bounds', async () => {
      await expect(
        service.changePassword(new UuidV7(IDENTITY_ID), {
          ...command,
          newPassword: 'short',
        }),
      ).rejects.toMatchObject({ code: 'PASSWORD_POLICY_FAILED' });
      expect(mockPasswordHashing.hash.mock.calls).toHaveLength(0);
    });

    it('rejects reuse of the current password hash', async () => {
      mockPasswordHashing.verify.mockResolvedValue(true);

      await expect(service.changePassword(new UuidV7(IDENTITY_ID), command)).rejects.toMatchObject({
        code: 'PASSWORD_POLICY_FAILED',
      });
      expect(mockIdentityRepo.save.mock.calls).toHaveLength(0);
    });

    it('rejects reuse of a historical password hash', async () => {
      mockPasswordHashing.verify.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      mockIdentityRepo.findPasswordHistory.mockResolvedValue([
        new PasswordHistoryRecord({
          passwordHistoryId: new UuidV7('0191310f-789a-7123-8123-000000000020'),
          identityId: new UuidV7(IDENTITY_ID),
          passwordHash: new ProtectedValue('old-hash'),
          hashAlgorithmReference: 'argon2id-v19',
          createdAt: FIXED_NOW,
        }),
      ]);

      await expect(service.changePassword(new UuidV7(IDENTITY_ID), command)).rejects.toMatchObject({
        code: 'PASSWORD_POLICY_FAILED',
      });
      expect(mockIdentityRepo.save.mock.calls).toHaveLength(0);
    });

    it('rejects a stale identity version with a state conflict', async () => {
      await expect(
        service.changePassword(new UuidV7(IDENTITY_ID), {
          ...command,
          expectedIdentityVersion: 1,
        }),
      ).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
      expect(mockIdentityRepo.save.mock.calls).toHaveLength(0);
    });

    it('rejects a change for a non-active identity', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(
        buildCredentialSnapshot('current-hash', 'DISABLED'),
      );

      await expect(service.changePassword(new UuidV7(IDENTITY_ID), command)).rejects.toMatchObject({
        code: 'CURRENT_CREDENTIAL_INVALID',
      });
    });

    it('rejects when no active password credential exists', async () => {
      mockIdentityRepo.findAuthenticationById.mockResolvedValue(buildSnapshot());

      await expect(service.changePassword(new UuidV7(IDENTITY_ID), command)).rejects.toMatchObject({
        code: 'CURRENT_CREDENTIAL_INVALID',
      });
    });

    it('maps a concurrent identity update to a state conflict', async () => {
      mockIdentityRepo.save.mockRejectedValue(new OptimisticConcurrencyError('Identity'));

      await expect(service.changePassword(new UuidV7(IDENTITY_ID), command)).rejects.toMatchObject({
        code: 'RESOURCE_STATE_CONFLICT',
      });
      expect(mockSessionRepo.revokeAllSessions.mock.calls).toHaveLength(0);
    });
  });
});
