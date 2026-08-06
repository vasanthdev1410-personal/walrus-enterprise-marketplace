import { randomBytes } from 'node:crypto';
import { createIdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';
import { NonProductionOtpRecoveryCodeAdapter } from './non-production-otp-recovery-code.adapter';

const configuration = createIdentityAuthenticationConfiguration({
  JWT_ISSUER: 'https://identity.test.walrus.invalid',
  JWT_AUDIENCE: 'walrus-test',
  JWT_SIGNING_KEY_ID: 'test-key-1',
  JWT_SIGNING_KEY_REFERENCE: 'file:C:/not-used.key',
  JWT_VERIFICATION_KEY_SET_REFERENCE: 'file:C:/not-used.pub',
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_VERSION: 'test-refresh-v1',
  REFRESH_TOKEN_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-refresh.key',
  REFRESH_TOKEN_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  OTP_HMAC_ACTIVE_KEY_VERSION: 'test-otp-v1',
  OTP_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-otp.key',
  OTP_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  RECOVERY_CODE_HMAC_ACTIVE_KEY_VERSION: 'test-recovery-v1',
  RECOVERY_CODE_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-recovery.key',
  RECOVERY_CODE_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_VERSION: 'test-lookup-v1',
  IDENTIFIER_LOOKUP_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-lookup.key',
  IDENTIFIER_LOOKUP_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  M01_ENVELOPE_KEK_ACTIVE_VERSION: 'test-kek-v1',
  M01_ENVELOPE_KEK_ACTIVE_REFERENCE: 'file:C:/not-used-envelope.key',
  M01_ENVELOPE_KEK_DECRYPTION_REFERENCES_JSON: '{}',
  CSRF_HMAC_ACTIVE_KEY_VERSION: 'test-csrf-v1',
  CSRF_HMAC_ACTIVE_KEY_REFERENCE: 'file:C:/not-used-csrf.key',
  CSRF_HMAC_VERIFICATION_KEY_REFERENCES_JSON: '{}',
  EMAIL_VERIFICATION_PROVIDER: 'AWS_SES',
  SMS_VERIFICATION_PROVIDER: 'AWS_END_USER_MESSAGING_SMS',
});

const otpContext = {
  environment: 'test',
  challengeId: '01890f3e-7b5a-7cc0-8c9d-1234567890ab',
  purpose: 'REGISTRATION_VERIFICATION',
} as const;

const recoveryContext = {
  environment: 'test',
  identityId: '01890f3e-7b5a-7cc0-8c9d-1234567890ac',
  recoveryCodeSetId: '01890f3e-7b5a-7cc0-8c9d-1234567890ad',
} as const;

function createAdapter(
  otpKey = randomBytes(32),
  recoveryKey = randomBytes(32),
): NonProductionOtpRecoveryCodeAdapter {
  return new NonProductionOtpRecoveryCodeAdapter(
    { version: 'test-otp-v1', key: otpKey },
    [],
    { version: 'test-recovery-v1', key: recoveryKey },
    [],
    configuration,
  );
}

describe('NonProductionOtpRecoveryCodeAdapter', () => {
  it('issues six-digit OTPs bound to their challenge and purpose', () => {
    const adapter = createAdapter();
    const issued = adapter.issueOtp(otpContext);

    expect(issued.rawValue).toMatch(/^\d{6}$/);
    expect(issued.digest).toMatch(/^hmac-sha256:otp:v1:test-otp-v1:[A-Za-z0-9_-]{43}$/);
    expect(adapter.matchesOtp(issued.rawValue, otpContext, issued.digest)).toBe(true);
    expect(
      adapter.matchesOtp(
        issued.rawValue,
        { ...otpContext, purpose: 'PASSWORD_RECOVERY' },
        issued.digest,
      ),
    ).toBe(false);
  });

  it('issues ten unique 128-bit Recovery Codes bound to one Identity and set', () => {
    const adapter = createAdapter();
    const codes = adapter.issueRecoveryCodeSet(recoveryContext);

    expect(codes).toHaveLength(10);
    expect(new Set(codes.map(({ rawValue }) => rawValue)).size).toBe(10);
    for (const code of codes) {
      expect(code.rawValue).toMatch(/^[A-Z2-7]{26}$/);
      expect(code.digest).toMatch(
        /^hmac-sha256:recovery-code:v1:test-recovery-v1:[A-Za-z0-9_-]{43}$/,
      );
      expect(adapter.matchesRecoveryCode(code.rawValue, recoveryContext, code.digest)).toBe(true);
    }
  });

  it('supports verification-only previous keys during rotation', () => {
    const previousOtpKey = randomBytes(32);
    const previousRecoveryKey = randomBytes(32);
    const oldAdapter = new NonProductionOtpRecoveryCodeAdapter(
      { version: 'test-otp-v0', key: previousOtpKey },
      [],
      { version: 'test-recovery-v0', key: previousRecoveryKey },
      [],
      configuration,
    );
    const oldOtp = oldAdapter.issueOtp(otpContext);
    const oldRecoveryCode = oldAdapter.issueRecoveryCodeSet(recoveryContext)[0];
    if (oldRecoveryCode === undefined) throw new Error('Recovery Code generation failed');
    const rotatedAdapter = new NonProductionOtpRecoveryCodeAdapter(
      { version: 'test-otp-v1', key: randomBytes(32) },
      [{ version: 'test-otp-v0', key: previousOtpKey }],
      { version: 'test-recovery-v1', key: randomBytes(32) },
      [{ version: 'test-recovery-v0', key: previousRecoveryKey }],
      configuration,
    );

    expect(rotatedAdapter.matchesOtp(oldOtp.rawValue, otpContext, oldOtp.digest)).toBe(true);
    expect(
      rotatedAdapter.matchesRecoveryCode(
        oldRecoveryCode.rawValue,
        recoveryContext,
        oldRecoveryCode.digest,
      ),
    ).toBe(true);
    expect(rotatedAdapter.issueOtp(otpContext).keyVersion).toBe('test-otp-v1');
  });

  it('rejects reuse of identical OTP and Recovery Code key material', () => {
    const reusedKey = randomBytes(32);
    expect(() => createAdapter(reusedKey, reusedKey)).toThrow('must be different');
  });

  it('fails closed before reading key references in production', async () => {
    await expect(
      NonProductionOtpRecoveryCodeAdapter.fromFileReferences(configuration, 'production'),
    ).rejects.toThrow('prohibited in production');
  });
});
