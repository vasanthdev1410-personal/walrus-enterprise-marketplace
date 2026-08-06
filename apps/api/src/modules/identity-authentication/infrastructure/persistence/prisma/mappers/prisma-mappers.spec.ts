import type {
  Identity as IdentityRecord,
  RecoveryRequest as RecoveryRequestRecord,
  Session as SessionRecord,
  VerificationChallenge as VerificationChallengeRecord,
} from '../../../../../../generated/prisma/client';
import { Identity } from '../../../../domain/identity/entities/identity';
import { RecoveryRequest } from '../../../../domain/recovery/entities/recovery-request';
import { PermittedRecoveryOperation } from '../../../../domain/recovery/value-objects/permitted-recovery-operation';
import { RecoveryPolicyVersion } from '../../../../domain/recovery/value-objects/recovery-policy-version';
import { Session } from '../../../../domain/session/entities/session';
import { SessionVersion } from '../../../../domain/session/value-objects/session-version';
import { AggregateVersion } from '../../../../domain/shared/value-objects/aggregate-version';
import { ProtectedValue } from '../../../../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../../../../domain/shared/value-objects/uuid-v7';
import { VerificationChallenge } from '../../../../domain/verification/entities/verification-challenge';
import { identityMapper } from './identity.mapper';
import { recoveryRequestMapper } from './recovery.mapper';
import { sessionMapper } from './session.mapper';
import { verificationChallengeMapper } from './verification.mapper';

const identityId = '018f22e2-79b0-7cc3-8c5e-000000000001';
const recordId = '018f22e2-79b0-7cc3-8c5e-000000000002';
const createdAt = new Date('2026-08-05T00:00:00.000Z');
const updatedAt = new Date('2026-08-05T00:01:00.000Z');

describe('Prisma Domain mappers', () => {
  it('round-trips the Identity Aggregate Root without adding optional values', () => {
    const record: IdentityRecord = {
      identityId,
      identityState: 'ACTIVE',
      verificationState: 'VERIFIED',
      aggregateVersion: 2,
      createdAt,
      updatedAt,
      lockedUntil: null,
      disabledAt: null,
      anonymizedAt: null,
      deletionRequestedAt: null,
    };

    const domain = identityMapper.toDomain(record);

    expect(domain).toBeInstanceOf(Identity);
    expect(identityMapper.toPersistence(domain)).toEqual({
      identityId,
      identityState: 'ACTIVE',
      verificationState: 'VERIFIED',
      aggregateVersion: 2,
      createdAt,
      updatedAt,
    });
  });

  it('round-trips the Session Aggregate Root and preserves authentication-only fields', () => {
    const record: SessionRecord = {
      sessionId: recordId,
      identityId,
      sessionClass: 'INTERACTIVE_WEB',
      sessionState: 'ACTIVE',
      sessionVersion: 1,
      authenticationAssurance: 'AAL1',
      authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
      authenticationMethods: ['PASSWORD'],
      createdAt,
      lastActivityAt: createdAt,
      idleExpiresAt: new Date('2026-08-05T00:30:00.000Z'),
      absoluteExpiresAt: new Date('2026-08-06T00:00:00.000Z'),
      aggregateVersion: 1,
      revokedAt: null,
      revocationReason: null,
      deviceSessionId: null,
      mfaVerifiedAt: null,
      correlationId: null,
    };

    const domain = sessionMapper.toDomain(record);

    expect(domain).toBeInstanceOf(Session);
    expect(sessionMapper.toPersistence(domain)).not.toHaveProperty('roles');
    expect(sessionMapper.toPersistence(domain)).not.toHaveProperty('permissions');
  });

  it('round-trips the Verification Challenge protected fields', () => {
    const record: VerificationChallengeRecord = {
      challengeId: recordId,
      identityId,
      purpose: 'REGISTRATION_VERIFICATION',
      channelType: 'EMAIL',
      protectedDestinationReference: 'protected-destination',
      challengeDigest: 'protected-digest',
      challengeState: 'PENDING',
      attemptCount: 0,
      maximumAttempts: 5,
      expiresAt: new Date('2026-08-05T00:05:00.000Z'),
      aggregateVersion: 1,
      createdAt,
      updatedAt: createdAt,
      consumedAt: null,
      cancelledAt: null,
      correlationId: null,
    };

    const domain = verificationChallengeMapper.toDomain(record);

    expect(domain).toBeInstanceOf(VerificationChallenge);
    expect(domain.properties.challengeDigest.toJSON()).toBe('[PROTECTED]');
    expect(verificationChallengeMapper.toPersistence(domain).challengeDigest).toBe(
      'protected-digest',
    );
  });

  it('round-trips the Recovery Request Aggregate Root', () => {
    const record: RecoveryRequestRecord = {
      recoveryRequestId: recordId,
      identityId,
      operationClass: 'PASSWORD_RESET',
      recoveryState: 'REQUESTED',
      recoveryAssurance: 'RA0',
      recoveryPolicyVersion: 'v1',
      permittedOperation: 'PASSWORD_RESET',
      stateVersion: 1,
      expiresAt: new Date('2026-08-05T01:00:00.000Z'),
      aggregateVersion: 1,
      createdAt,
      updatedAt: createdAt,
      approvedAt: null,
      executionStartedAt: null,
      completedAt: null,
      terminalReason: null,
      idempotencyKey: null,
      correlationId: null,
    };

    const domain = recoveryRequestMapper.toDomain(record);

    expect(domain).toBeInstanceOf(RecoveryRequest);
    expect(recoveryRequestMapper.toPersistence(domain).recoveryState).toBe('REQUESTED');
  });

  it('maps approved Domain objects without framework types entering the Domain layer', () => {
    const identity = new Identity({
      identityId: new UuidV7(identityId),
      identityState: 'PENDING_VERIFICATION',
      verificationState: 'PENDING_VERIFICATION',
      aggregateVersion: new AggregateVersion(1),
      createdAt,
      updatedAt: createdAt,
    });
    const recovery = new RecoveryRequest({
      recoveryRequestId: new UuidV7(recordId),
      identityId: new UuidV7(identityId),
      operationClass: 'PASSWORD_RESET',
      recoveryState: 'REQUESTED',
      recoveryAssurance: 'RA0',
      recoveryPolicyVersion: new RecoveryPolicyVersion('v1'),
      permittedOperation: new PermittedRecoveryOperation('PASSWORD_RESET'),
      stateVersion: 1,
      expiresAt: new Date('2026-08-05T01:00:00.000Z'),
      aggregateVersion: new AggregateVersion(1),
      createdAt,
      updatedAt: createdAt,
    });

    expect(identityMapper.toPersistence(identity).identityId).toBe(identityId);
    expect(recoveryRequestMapper.toPersistence(recovery).recoveryRequestId).toBe(recordId);
    expect(new ProtectedValue('secret').toJSON()).toBe('[PROTECTED]');
    expect(new SessionVersion(1).value).toBe(1);
  });
});
