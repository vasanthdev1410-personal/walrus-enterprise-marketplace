import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AuthorizationDecisionRecord } from './authorization-decision-record';

const SUBJECT = new UuidV7('0191310f-789a-7123-8123-000000000001');
const NOW = new Date('2026-08-11T00:00:00.000Z');

describe('AuthorizationDecisionRecord (M02 domain core)', () => {
  it('accepts a granted record without a denial reason', () => {
    const record = new AuthorizationDecisionRecord({
      authorizationReference: 'azr:0123456789abcdef0123456789abcdef',
      subjectIdentityId: SUBJECT,
      permissionId: 'recovery.approval.decide',
      decisionOutcome: 'GRANTED',
      decidedAt: NOW,
      createdAt: NOW,
    });

    expect(record.properties.decisionOutcome).toBe('GRANTED');
    expect(record.properties.denialReason).toBeUndefined();
    expect(Object.isFrozen(record.properties)).toBe(true);
  });

  it('accepts a denied record with an internal denial reason', () => {
    const record = new AuthorizationDecisionRecord({
      authorizationReference: 'azr:0123456789abcdef0123456789abcdef',
      subjectIdentityId: SUBJECT,
      permissionId: 'recovery.approval.decide',
      decisionOutcome: 'DENIED',
      denialReason: 'PERMISSION_NOT_GRANTED',
      sessionIdentifier: 'sess-1',
      correlationId: '0191310f-789a-7123-8123-000000000002',
      decidedAt: NOW,
      createdAt: NOW,
    });

    expect(record.properties.denialReason).toBe('PERMISSION_NOT_GRANTED');
    expect(record.properties.sessionIdentifier).toBe('sess-1');
  });

  it('rejects an empty authorization reference', () => {
    expect(
      () =>
        new AuthorizationDecisionRecord({
          authorizationReference: '   ',
          subjectIdentityId: SUBJECT,
          permissionId: 'recovery.approval.decide',
          decisionOutcome: 'DENIED',
          denialReason: 'UNKNOWN_PERMISSION',
          decidedAt: NOW,
          createdAt: NOW,
        }),
    ).toThrow('Authorization decision record requires a reference');
  });

  it('rejects a granted record carrying a denial reason', () => {
    expect(
      () =>
        new AuthorizationDecisionRecord({
          authorizationReference: 'azr:0123456789abcdef0123456789abcdef',
          subjectIdentityId: SUBJECT,
          permissionId: 'recovery.approval.decide',
          decisionOutcome: 'GRANTED',
          denialReason: 'PERMISSION_NOT_GRANTED',
          decidedAt: NOW,
          createdAt: NOW,
        }),
    ).toThrow('Granted decision record must not carry a denial reason');
  });

  it('rejects a denied record without a denial reason', () => {
    expect(
      () =>
        new AuthorizationDecisionRecord({
          authorizationReference: 'azr:0123456789abcdef0123456789abcdef',
          subjectIdentityId: SUBJECT,
          permissionId: 'recovery.approval.decide',
          decisionOutcome: 'DENIED',
          decidedAt: NOW,
          createdAt: NOW,
        }),
    ).toThrow('Denied decision record requires a denial reason');
  });

  it('rejects an empty session identifier', () => {
    expect(
      () =>
        new AuthorizationDecisionRecord({
          authorizationReference: 'azr:0123456789abcdef0123456789abcdef',
          subjectIdentityId: SUBJECT,
          permissionId: 'recovery.approval.decide',
          decisionOutcome: 'DENIED',
          denialReason: 'UNKNOWN_PERMISSION',
          sessionIdentifier: '   ',
          decidedAt: NOW,
          createdAt: NOW,
        }),
    ).toThrow('Session identifier must not be empty');
  });
});
