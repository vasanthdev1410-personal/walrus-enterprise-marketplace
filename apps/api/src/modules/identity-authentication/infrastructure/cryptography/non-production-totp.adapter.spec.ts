import { createHmac, randomBytes } from 'node:crypto';
import type { EnvelopeEncryptionContext } from '../../application/ports/envelope-encryption.port';
import type { IdentityAuthenticationConfiguration } from '../configuration/identity-authentication.configuration';
import { NonProductionEnvelopeEncryptionAdapter } from './non-production-envelope-encryption.adapter';
import { NonProductionTotpAdapter } from './non-production-totp.adapter';

const context: EnvelopeEncryptionContext = {
  environment: 'test',
  recordType: 'MfaFactor',
  recordId: '01890f3e-7b5a-7cc0-8c9d-1234567890ab',
  fieldName: 'totpSecret',
};
const configuration = {
  totp: {
    algorithm: 'HMAC_SHA256',
    secretBytes: 32,
    base32EncodedLength: 52,
    decimalLength: 6,
    timeStepSeconds: 30,
    allowedClockDriftSteps: 1,
    challengeLifetimeSeconds: 300,
    maximumVerificationAttempts: 5,
  },
} as IdentityAuthenticationConfiguration;

describe('NonProductionTotpAdapter', () => {
  it('creates a canonical 256-bit Base32 enrollment secret and protects it', () => {
    const adapter = createAdapter();
    const enrollment = adapter.createEnrollmentSecret(context);

    expect(enrollment.base32Secret).toMatch(/^[A-Z2-7]{52}$/);
    expect(enrollment.base32Secret).not.toContain('=');
    expect(enrollment.protectedEnvelope.ciphertext).not.toContain(enrollment.base32Secret);
  });

  it('accepts only the current and adjacent time steps', () => {
    const adapter = createAdapter();
    const enrollment = adapter.createEnrollmentSecret(context);
    const now = new Date('2026-08-05T00:00:00.000Z');
    const secret = Buffer.from(
      createEnvelopeAdapter().decrypt(enrollment.protectedEnvelope, context),
    );
    const current = generateTestCode(secret, now);
    secret.fill(0);

    expect(adapter.verify(current, enrollment.protectedEnvelope, context, now).valid).toBe(true);
    expect(
      adapter.verify(
        current,
        enrollment.protectedEnvelope,
        context,
        new Date(now.getTime() + 60_000),
      ).valid,
    ).toBe(false);
  });

  it('rejects malformed evidence and envelope-context substitution', () => {
    const adapter = createAdapter();
    const enrollment = adapter.createEnrollmentSecret(context);
    const now = new Date('2026-08-05T00:00:00.000Z');

    expect(adapter.verify('12345', enrollment.protectedEnvelope, context, now)).toEqual({
      valid: false,
    });
    expect(() =>
      adapter.verify(
        '123456',
        enrollment.protectedEnvelope,
        { ...context, recordId: 'different' },
        now,
      ),
    ).toThrow();
  });

  it('fails closed in production', () => {
    const envelope = new NonProductionEnvelopeEncryptionAdapter(
      { version: 'test-v1', key: randomBytes(32) },
      [],
    );
    expect(() => new NonProductionTotpAdapter(envelope, configuration, 'production')).toThrow(
      'prohibited in production',
    );
  });
});

function createAdapter(): NonProductionTotpAdapter {
  return new NonProductionTotpAdapter(createEnvelopeAdapter(), configuration, 'test');
}

const testKek = Buffer.alloc(32, 7);

function createEnvelopeAdapter(): NonProductionEnvelopeEncryptionAdapter {
  return new NonProductionEnvelopeEncryptionAdapter({ version: 'test-v1', key: testKek }, []);
}

function generateTestCode(secret: Buffer, now: Date): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now.getTime() / 1000 / 30)));
  const digest = createHmac('sha256', secret).update(counter).digest();
  const finalByte = digest.at(-1);
  if (finalByte === undefined) throw new Error('TOTP digest is empty');
  const offset = finalByte & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fff_ffff;
  return (binary % 1_000_000).toString().padStart(6, '0');
}
