import { IdentityStateTransition } from './identity/entities/identity-state-transition';
import { RecoveryApprovalRecord } from './recovery/entities/recovery-approval-record';
import { PermittedRecoveryOperation } from './recovery/value-objects/permitted-recovery-operation';
import { Session } from './session/entities/session';
import { RefreshTokenRecord } from './session/entities/refresh-token-record';
import { SessionVersion } from './session/value-objects/session-version';
import { AggregateVersion } from './shared/value-objects/aggregate-version';
import { ProtectedValue } from './shared/value-objects/protected-value';
import { UuidV7 } from './shared/value-objects/uuid-v7';
import { RefreshTokenDigest } from './session/value-objects/refresh-token-digest';

const uuid = (suffix: string): UuidV7 => new UuidV7(`018f22e2-79b0-7cc3-8c5e-${suffix}`);
const createdAt = new Date('2026-08-05T00:00:00.000Z');

describe('Module 01 domain persistence invariants', () => {
  it('accepts only the approved initial Identity transition', () => {
    expect(
      () =>
        new IdentityStateTransition({
          identityStateTransitionId: uuid('000000000001'),
          identityId: uuid('000000000002'),
          toState: 'PENDING_VERIFICATION',
          stateVersion: 1,
          transitionedAt: createdAt,
          createdAt,
        }),
    ).not.toThrow();

    expect(
      () =>
        new IdentityStateTransition({
          identityStateTransitionId: uuid('000000000003'),
          identityId: uuid('000000000002'),
          toState: 'ACTIVE',
          stateVersion: 1,
          transitionedAt: createdAt,
          createdAt,
        }),
    ).toThrow('Initial Identity transition');
  });

  it('rejects an ordinary authenticated Session at AAL0', () => {
    expect(
      () =>
        new Session({
          sessionId: uuid('000000000004'),
          identityId: uuid('000000000002'),
          sessionClass: 'INTERACTIVE_WEB',
          sessionState: 'ACTIVE',
          sessionVersion: new SessionVersion(1),
          authenticationAssurance: 'AAL0',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD'],
          createdAt,
          lastActivityAt: createdAt,
          idleExpiresAt: new Date('2026-08-05T00:30:00.000Z'),
          absoluteExpiresAt: new Date('2026-08-05T08:00:00.000Z'),
          aggregateVersion: new AggregateVersion(1),
        }),
    ).toThrow('Ordinary authenticated Session cannot have AAL0');
  });

  it('requires a recorded MFA verification for an AAL2 Session', () => {
    expect(
      () =>
        new Session({
          sessionId: uuid('000000000004'),
          identityId: uuid('000000000002'),
          sessionClass: 'INTERACTIVE_WEB',
          sessionState: 'ACTIVE',
          sessionVersion: new SessionVersion(1),
          authenticationAssurance: 'AAL2',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD', 'TOTP_AUTHENTICATOR'],
          createdAt,
          lastActivityAt: createdAt,
          idleExpiresAt: new Date('2026-08-05T00:30:00.000Z'),
          absoluteExpiresAt: new Date('2026-08-05T08:00:00.000Z'),
          aggregateVersion: new AggregateVersion(1),
        }),
    ).toThrow('AAL2 Session requires mfaVerifiedAt');
  });

  it('accepts an AAL2 Session that records the MFA verification', () => {
    expect(
      () =>
        new Session({
          sessionId: uuid('000000000004'),
          identityId: uuid('000000000002'),
          sessionClass: 'INTERACTIVE_WEB',
          sessionState: 'ACTIVE',
          sessionVersion: new SessionVersion(1),
          authenticationAssurance: 'AAL2',
          authenticationSecurityClassificationReference: 'STANDARD_AUTHENTICATION',
          authenticationMethods: ['PASSWORD', 'TOTP_AUTHENTICATOR'],
          createdAt,
          lastActivityAt: createdAt,
          idleExpiresAt: new Date('2026-08-05T00:30:00.000Z'),
          absoluteExpiresAt: new Date('2026-08-05T08:00:00.000Z'),
          aggregateVersion: new AggregateVersion(1),
          mfaVerifiedAt: new Date('2026-08-04T23:59:30.000Z'),
        }),
    ).not.toThrow();
  });

  it('requires consumed evidence for a used Refresh Token', () => {
    expect(
      () =>
        new RefreshTokenRecord({
          refreshTokenId: uuid('000000000005'),
          tokenFamilyId: uuid('000000000006'),
          tokenDigest: new RefreshTokenDigest('protected-token-digest'),
          tokenState: 'USED',
          issuedAt: createdAt,
          expiresAt: new Date('2026-08-06T00:00:00.000Z'),
          createdAt,
        }),
    ).toThrow('Used Refresh Token requires consumedAt');
  });

  it('enforces separation of duties for Recovery approval', () => {
    const sameIdentity = uuid('000000000007');

    expect(
      () =>
        new RecoveryApprovalRecord({
          recoveryApprovalId: uuid('000000000008'),
          recoveryRequestId: uuid('000000000009'),
          recoveredIdentityId: sameIdentity,
          operation: new PermittedRecoveryOperation('PRIVILEGED_ACCOUNT_RECOVERY'),
          approverIdentityId: sameIdentity,
          approverAuthenticationEvidenceReference: new ProtectedValue('approval-evidence'),
          decision: 'APPROVED',
          decidedAt: createdAt,
          expiresAt: new Date('2026-08-05T01:00:00.000Z'),
          createdAt,
        }),
    ).toThrow('Recovery approver must be independent');
  });

  it('never serializes a protected value as plaintext', () => {
    const protectedValue = new ProtectedValue('secret-value');

    expect(protectedValue.toString()).toBe('[PROTECTED]');
    expect(protectedValue.toJSON()).toBe('[PROTECTED]');
  });
});
